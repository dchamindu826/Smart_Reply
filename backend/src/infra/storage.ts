import { Global, Injectable, Module } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config';
import { hmacSha256, safeEqual } from '../common/crypto';

const UPLOAD_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 60 * 60;

/**
 * Object storage. Two drivers:
 * - `s3`: any S3-compatible store (MinIO, AWS S3, Cloudflare R2, DigitalOcean Spaces). Clients upload
 *   and download with presigned URLs.
 * - `local`: files on the API server's disk under STORAGE_LOCAL_DIR. Clients upload and download
 *   through `/api/v1/files/:id/content` with a signed, short-lived query string.
 * Keys always start with the company id.
 */
@Injectable()
export class Storage {
  private readonly s3: S3Client | null =
    env.STORAGE_DRIVER === 's3'
      ? new S3Client({
          region: env.S3_REGION,
          endpoint: env.S3_ENDPOINT || undefined,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
          credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
        })
      : null;
  /** Signs URLs with the public endpoint so browsers can reach them. */
  private readonly s3Public: S3Client | null =
    env.STORAGE_DRIVER === 's3'
      ? new S3Client({
          region: env.S3_REGION,
          endpoint: env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT || undefined,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
          credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
        })
      : null;
  private readonly root = path.resolve(env.STORAGE_LOCAL_DIR);

  static key(companyId: string | null, fileId: string, name: string): string {
    const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
    return `${companyId ?? 'platform'}/${fileId}/${safe}`;
  }

  private localPath(key: string): string {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('Bad storage key');
    return p;
  }

  private sign(fileId: string, action: 'up' | 'down', exp: number): string {
    return hmacSha256(env.JWT_SECRET, `${fileId}.${action}.${exp}`);
  }

  verifyLocalSignature(fileId: string, action: 'up' | 'down', exp: string, sig: string): boolean {
    const e = Number(exp);
    if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
    return safeEqual(this.sign(fileId, action, e), sig);
  }

  async uploadUrl(fileId: string, key: string, mime: string): Promise<{ url: string; headers: Record<string, string> }> {
    if (this.s3Public) {
      const url = await getSignedUrl(this.s3Public, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: mime }), {
        expiresIn: UPLOAD_TTL_SECONDS
      });
      return { url, headers: { 'Content-Type': mime } };
    }
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
    return {
      url: `${env.API_URL}/api/v1/files/${fileId}/content?exp=${exp}&sig=${this.sign(fileId, 'up', exp)}`,
      headers: { 'Content-Type': mime }
    };
  }

  async downloadUrl(fileId: string, key: string, fileName?: string): Promise<string> {
    if (this.s3Public) {
      return getSignedUrl(
        this.s3Public,
        new GetObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          ...(fileName ? { ResponseContentDisposition: `inline; filename="${fileName.replace(/"/g, '')}"` } : {})
        }),
        { expiresIn: DOWNLOAD_TTL_SECONDS }
      );
    }
    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS;
    return `${env.API_URL}/api/v1/files/${fileId}/content?exp=${exp}&sig=${this.sign(fileId, 'down', exp)}`;
  }

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: mime }));
      return;
    }
    const p = this.localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  async putStream(key: string, stream: Readable, mime: string, maxBytes: number): Promise<number> {
    if (this.s3) {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) throw new Error('File too large');
        chunks.push(chunk as Buffer);
      }
      await this.put(key, Buffer.concat(chunks), mime);
      return size;
    }
    const p = this.localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    let size = 0;
    const limiter = async function* (src: Readable) {
      for await (const chunk of src) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) throw new Error('File too large');
        yield chunk as Buffer;
      }
    };
    await pipeline(stream, limiter, createWriteStream(p));
    return size;
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) throw new Error('Empty object');
      return Buffer.from(bytes);
    }
    return readFile(this.localPath(key));
  }

  /** Local driver only: a stream for serving the file. */
  async localStream(key: string): Promise<{ stream: Readable; size: number }> {
    const p = this.localPath(key);
    const s = await stat(p);
    return { stream: createReadStream(p), size: s.size };
  }

  async size(key: string): Promise<number | null> {
    try {
      if (this.s3) {
        const buf = await this.get(key);
        return buf.length;
      }
      return (await stat(this.localPath(key))).size;
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return;
    }
    await rm(this.localPath(key), { force: true });
  }

  get isLocal(): boolean {
    return this.s3 === null;
  }
}

@Global()
@Module({ providers: [Storage], exports: [Storage] })
export class StorageModule {}
