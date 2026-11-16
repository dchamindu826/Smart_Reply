import { Global, Injectable, Module } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  CreateFileInput,
  EXTRA_IMAGE_MIMES,
  FileRef,
  MEDIA_LIMITS,
  MediaKind,
  UploadTicket,
  mediaKindForMime
} from '@smart-reply/shared';
import { AppError, notFound } from '../common/errors';
import type { Db, DbOrTx } from '../db/client';
import { files } from '../db/schema';
import { InjectDb } from '../infra/db';
import { Storage } from '../infra/storage';

export type FileRow = typeof files.$inferSelect;

const KNOWLEDGE_MIMES = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

/** Upload tickets, size and type rules, and download links for stored files. */
@Injectable()
export class FilesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly storage: Storage
  ) {}

  /** Decide the WhatsApp media kind and check the size limit before any upload. */
  static classify(input: Pick<CreateFileInput, 'mime' | 'sizeBytes' | 'purpose'>): MediaKind {
    const mime = input.mime.split(';')[0].trim().toLowerCase();
    let kind = mediaKindForMime(mime);
    const relaxed = input.purpose === 'media' || input.purpose === 'product' || input.purpose === 'knowledge' || input.purpose === 'import';
    if (!kind && relaxed && (EXTRA_IMAGE_MIMES as readonly string[]).includes(mime)) kind = 'image';
    if (!kind && (input.purpose === 'knowledge' || input.purpose === 'import') && KNOWLEDGE_MIMES.includes(mime)) kind = 'document';
    if (!kind && input.purpose === 'media' && mime === 'video/quicktime') kind = 'video';
    if (!kind) throw new AppError('FILE_TYPE_NOT_ALLOWED', `WhatsApp does not accept ${mime} files.`);
    const max = input.purpose === 'media' && kind === 'video' ? 100 * 1024 * 1024 : MEDIA_LIMITS[kind].max;
    if (input.sizeBytes > max) {
      throw new AppError('FILE_TOO_LARGE', `${kind[0].toUpperCase() + kind.slice(1)} files can be at most ${Math.round(max / 1024 / 1024)} MB on WhatsApp.`);
    }
    return kind;
  }

  async createUpload(companyId: string | null, userId: string, input: CreateFileInput): Promise<UploadTicket> {
    const kind = FilesService.classify(input);
    const id = uuidv7();
    const mime = input.mime.split(';')[0].trim().toLowerCase();
    const storageKey = Storage.key(companyId, id, input.name);
    await this.db.insert(files).values({
      id,
      companyId,
      purpose: input.purpose,
      kind,
      name: input.name,
      mime,
      sizeBytes: input.sizeBytes,
      storageKey,
      uploaded: false,
      createdBy: userId
    });
    const { url, headers } = await this.storage.uploadUrl(id, storageKey, mime);
    return { fileId: id, uploadUrl: url, uploadMethod: 'PUT', headers };
  }

  /** Server-side store (webhook media, generated exports). */
  async storeBuffer(
    companyId: string | null,
    input: { name: string; mime: string; bytes: Buffer; purpose: string; kind?: MediaKind; voice?: boolean; createdBy?: string | null; waMediaId?: string; sha256?: string },
    tx?: DbOrTx
  ): Promise<FileRow> {
    const id = uuidv7();
    const mime = input.mime.split(';')[0].trim().toLowerCase();
    const kind = input.kind ?? mediaKindForMime(mime) ?? 'document';
    const storageKey = Storage.key(companyId, id, input.name);
    await this.storage.put(storageKey, input.bytes, mime);
    const [row] = await (tx ?? this.db)
      .insert(files)
      .values({
        id,
        companyId,
        purpose: input.purpose,
        kind,
        name: input.name,
        mime,
        sizeBytes: input.bytes.length,
        storageKey,
        uploaded: true,
        voice: input.voice ?? false,
        waMediaId: input.waMediaId ?? null,
        sha256: input.sha256 ?? null,
        createdBy: input.createdBy ?? null
      })
      .returning();
    return row;
  }

  /** Files of this company (or platform files when companyId is null) that finished uploading. */
  async requireUploaded(companyId: string | null, ids: string[], tx?: DbOrTx): Promise<FileRow[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.db)
      .select()
      .from(files)
      .where(and(inArray(files.id, ids), companyId ? eq(files.companyId, companyId) : isNull(files.companyId)));
    const byId = new Map(rows.map(r => [r.id, r]));
    const out: FileRow[] = [];
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) throw notFound('File');
      if (!r.uploaded) {
        // S3 uploads go straight to storage; confirm the object exists.
        const size = await this.storage.size(r.storageKey);
        if (size === null) throw new AppError('BAD_REQUEST', `“${r.name}” has not finished uploading.`);
        await (tx ?? this.db).update(files).set({ uploaded: true, sizeBytes: size }).where(eq(files.id, r.id));
        r.uploaded = true;
        r.sizeBytes = size;
      }
      out.push(r);
    }
    return out;
  }

  async get(companyId: string | null, id: string): Promise<FileRow> {
    const [r] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, id), companyId ? or(eq(files.companyId, companyId), isNull(files.companyId)) : isNull(files.companyId)))
      .limit(1);
    if (!r) throw notFound('File');
    return r;
  }

  async ref(row: FileRow): Promise<FileRef> {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
      url: await this.storage.downloadUrl(row.id, row.storageKey, row.name),
      durationSeconds: row.durationSeconds,
      voice: row.voice
    };
  }

  async refs(ids: string[], tx?: DbOrTx): Promise<Map<string, FileRef>> {
    const out = new Map<string, FileRef>();
    if (ids.length === 0) return out;
    const rows = await (tx ?? this.db).select().from(files).where(inArray(files.id, [...new Set(ids)]));
    await Promise.all(rows.map(async r => out.set(r.id, await this.ref(r))));
    return out;
  }
}

@Global()
@Module({ providers: [FilesService], exports: [FilesService] })
export class FilesCoreModule {}
