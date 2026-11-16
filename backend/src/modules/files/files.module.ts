import { Controller, Get, HttpCode, Module, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { UploadTicket, createFileSchema } from '@smart-reply/shared';
import { AnyAuth, Public, Roles } from '../../common/decorators';
import { AppError, notFound } from '../../common/errors';
import type { Session } from '../../common/session';
import { ZBody } from '../../common/validation';
import { FilesService } from '../../core/files.service';
import type { Db } from '../../db/client';
import { files } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Storage } from '../../infra/storage';

@Controller('files')
class FilesController {
  constructor(
    private readonly filesSvc: FilesService,
    private readonly storage: Storage,
    @InjectDb() private readonly db: Db
  ) {}

  /** Step 1 of an upload: get a ticket, then PUT the bytes to `uploadUrl`. */
  @Roles('manager', 'staff', 'system_admin')
  @Post()
  create(@AnyAuth() s: Session, @ZBody(createFileSchema) body: z.infer<typeof createFileSchema>): Promise<UploadTicket> {
    return this.filesSvc.createUpload(s.companyId, s.userId, body);
  }

  /** Redirects to a short-lived download link. */
  @Roles('manager', 'staff', 'system_admin')
  @Get(':id')
  async open(@AnyAuth() s: Session, @Param('id') id: string, @Res() res: Response): Promise<void> {
    const f = await this.filesSvc.get(s.companyId, id);
    res.redirect(302, await this.storage.downloadUrl(f.id, f.storageKey, f.name));
  }

  /** Local storage driver: receives the upload. The signed query string is the permission. */
  @Public()
  @Put(':id/content')
  @HttpCode(204)
  async upload(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Req() req: Request): Promise<void> {
    if (!this.storage.isLocal) throw notFound('File');
    if (!this.storage.verifyLocalSignature(id, 'up', exp, sig)) throw new AppError('FORBIDDEN', 'Upload link expired.');
    const [f] = await this.db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!f || f.uploaded) throw notFound('File');
    const max = Math.max(f.sizeBytes, 1) + 1024;
    try {
      const size = await this.storage.putStream(f.storageKey, req, f.mime, max);
      await this.db.update(files).set({ uploaded: true, sizeBytes: size }).where(eq(files.id, id));
    } catch (err) {
      await this.storage.remove(f.storageKey);
      throw new AppError('FILE_TOO_LARGE', err instanceof Error ? err.message : 'Upload failed');
    }
  }

  /** Local storage driver: serves the file. */
  @Public()
  @Get(':id/content')
  async download(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response): Promise<void> {
    if (!this.storage.isLocal || !this.storage.verifyLocalSignature(id, 'down', exp, sig)) throw notFound('File');
    const [f] = await this.db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!f || !f.uploaded) throw notFound('File');
    const { stream, size } = await this.storage.localStream(f.storageKey);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const inline = f.mime.startsWith('image/') || f.mime.startsWith('audio/') || f.mime.startsWith('video/') || f.mime === 'application/pdf';
    res.setHeader('Content-Disposition', `${inline && f.mime !== 'image/svg+xml' ? 'inline' : 'attachment'}; filename="${f.name.replace(/"/g, '')}"`);
    if (f.mime === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    stream.pipe(res);
  }
}

@Module({ controllers: [FilesController] })
export class FilesModule {}
