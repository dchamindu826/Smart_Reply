import { Injectable } from '@nestjs/common';
import { SQL, and, asc, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MediaCategory, MediaItem, mediaCategorySchema, mediaItemSchema, mediaQuery, updateMediaSchema } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError, notFound } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { findOwned } from '../../common/tenant';
import { FilesService } from '../../core/files.service';
import type { Db } from '../../db/client';
import { files, mediaCategories, mediaFavorites, mediaItems, users } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { defined, likePattern } from './util';

type MediaQuery = z.infer<typeof mediaQuery>;

@Injectable()
export class MediaService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly files: FilesService,
    private readonly audit: Audit
  ) {}

  private async query(s: CompanySession, where: (SQL | undefined)[], order: SQL[]): Promise<MediaItem[]> {
    const rows = await this.db
      .select({ item: mediaItems, file: files, categoryName: mediaCategories.name, addedBy: users.name, fav: mediaFavorites.userId })
      .from(mediaItems)
      .innerJoin(files, eq(files.id, mediaItems.fileId))
      .leftJoin(mediaCategories, eq(mediaCategories.id, mediaItems.categoryId))
      .leftJoin(users, eq(users.id, mediaItems.addedBy))
      .leftJoin(mediaFavorites, and(eq(mediaFavorites.mediaItemId, mediaItems.id), eq(mediaFavorites.userId, s.userId)))
      .where(and(eq(mediaItems.companyId, s.companyId), ...where))
      .orderBy(...order);
    return Promise.all(
      rows.map(async r => {
        const file = await this.files.ref(r.file);
        return {
          id: r.item.id,
          title: r.item.title,
          kind: r.item.kind,
          file,
          thumbnailUrl: r.item.kind === 'image' ? file.url : null,
          caption: r.item.caption,
          categoryId: r.item.categoryId,
          categoryName: r.categoryName ?? '',
          tags: r.item.tags,
          addedBy: r.addedBy ?? '',
          createdAt: r.item.createdAt.toISOString(),
          favorite: r.fav !== null,
          shareCount: r.item.shareCount,
          downloadCount: r.item.downloadCount,
          width: r.item.width,
          height: r.item.height
        };
      })
    );
  }

  /** `favoritesOnly` is read from the raw query string: zod's coerce turns "false" into true. */
  async list(s: CompanySession, q: MediaQuery, favoritesOnly: boolean): Promise<MediaItem[]> {
    const where: (SQL | undefined)[] = [
      q.kind ? eq(mediaItems.kind, q.kind) : undefined,
      q.category ? eq(mediaItems.categoryId, q.category) : undefined,
      q.search
        ? or(
            ilike(mediaItems.title, likePattern(q.search)),
            ilike(mediaItems.caption, likePattern(q.search)),
            sql`exists (select 1 from unnest(${mediaItems.tags}) t where t ilike ${likePattern(q.search)})`
          )
        : undefined,
      favoritesOnly ? isNotNull(mediaFavorites.userId) : undefined
    ];
    const order: SQL[] =
      q.sort === 'oldest'
        ? [asc(mediaItems.createdAt)]
        : q.sort === 'popular'
          ? [desc(sql`${mediaItems.shareCount} + ${mediaItems.downloadCount}`), desc(mediaItems.createdAt)]
          : q.sort === 'name'
            ? [asc(mediaItems.title)]
            : [desc(mediaItems.createdAt)];
    return this.query(s, where, order);
  }

  async get(s: CompanySession, id: string): Promise<MediaItem> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Media');
    const [item] = await this.query(s, [eq(mediaItems.id, id)], []);
    if (!item) throw notFound('Media');
    return item;
  }

  private async checkCategory(s: CompanySession, categoryId: string | null | undefined): Promise<void> {
    if (categoryId) await findOwned(this.db, mediaCategories, s.companyId, categoryId, 'Category');
  }

  async create(s: CompanySession, input: z.infer<typeof mediaItemSchema>): Promise<MediaItem> {
    const [file] = await this.files.requireUploaded(s.companyId, [input.fileId]);
    if (file.kind !== 'image' && file.kind !== 'video') throw new AppError('BAD_REQUEST', 'The gallery holds photos and videos only.');
    await this.checkCategory(s, input.categoryId);
    const [row] = await this.db
      .insert(mediaItems)
      .values({
        companyId: s.companyId,
        title: input.title,
        kind: file.kind,
        fileId: file.id,
        caption: input.caption,
        categoryId: input.categoryId,
        tags: input.tags,
        width: input.width ?? file.width,
        height: input.height ?? file.height,
        durationSeconds: input.durationSeconds ?? file.durationSeconds,
        addedBy: s.userId
      })
      .returning();
    await this.audit.log(s, { action: 'media.create', targetType: 'media', targetId: row.id, summary: `Added “${row.title}” to the media gallery` });
    return this.get(s, row.id);
  }

  async update(s: CompanySession, id: string, input: z.infer<typeof updateMediaSchema>): Promise<MediaItem> {
    const row = await findOwned(this.db, mediaItems, s.companyId, id, 'Media');
    await this.checkCategory(s, input.categoryId);
    const patch = defined(input);
    if (Object.keys(patch).length) await this.db.update(mediaItems).set(patch).where(eq(mediaItems.id, row.id));
    await this.audit.log(s, { action: 'media.update', targetType: 'media', targetId: row.id, summary: `Changed “${patch.title ?? row.title}” in the media gallery` });
    return this.get(s, row.id);
  }

  async remove(s: CompanySession, id: string): Promise<{ ok: true }> {
    const row = await findOwned(this.db, mediaItems, s.companyId, id, 'Media');
    await this.db.delete(mediaItems).where(eq(mediaItems.id, row.id));
    await this.audit.log(s, { action: 'media.delete', targetType: 'media', targetId: row.id, summary: `Removed “${row.title}” from the media gallery` });
    return { ok: true };
  }

  async favorite(s: CompanySession, id: string, favorite: boolean): Promise<MediaItem> {
    const row = await findOwned(this.db, mediaItems, s.companyId, id, 'Media');
    if (favorite) await this.db.insert(mediaFavorites).values({ mediaItemId: row.id, userId: s.userId, companyId: s.companyId }).onConflictDoNothing();
    else await this.db.delete(mediaFavorites).where(and(eq(mediaFavorites.mediaItemId, row.id), eq(mediaFavorites.userId, s.userId)));
    return this.get(s, row.id);
  }

  async share(s: CompanySession, id: string): Promise<MediaItem> {
    const row = await findOwned(this.db, mediaItems, s.companyId, id, 'Media');
    await this.db.update(mediaItems).set({ shareCount: sql`${mediaItems.shareCount} + 1` }).where(eq(mediaItems.id, row.id));
    return this.get(s, row.id);
  }

  async download(s: CompanySession, id: string): Promise<{ url: string }> {
    const row = await findOwned(this.db, mediaItems, s.companyId, id, 'Media');
    await this.db.update(mediaItems).set({ downloadCount: sql`${mediaItems.downloadCount} + 1` }).where(eq(mediaItems.id, row.id));
    const file = await this.files.get(s.companyId, row.fileId);
    return { url: (await this.files.ref(file)).url };
  }

  /* ───────── Categories ───────── */

  async categories(s: CompanySession): Promise<MediaCategory[]> {
    return this.db
      .select({ id: mediaCategories.id, name: mediaCategories.name })
      .from(mediaCategories)
      .where(eq(mediaCategories.companyId, s.companyId))
      .orderBy(asc(mediaCategories.name));
  }

  async createCategory(s: CompanySession, input: z.infer<typeof mediaCategorySchema>): Promise<MediaCategory> {
    const existing = await this.db
      .select({ id: mediaCategories.id })
      .from(mediaCategories)
      .where(and(eq(mediaCategories.companyId, s.companyId), sql`lower(${mediaCategories.name}) = lower(${input.name})`))
      .limit(1);
    if (existing.length) throw new AppError('CONFLICT', `A category called “${input.name}” already exists.`);
    const [row] = await this.db.insert(mediaCategories).values({ companyId: s.companyId, name: input.name }).returning();
    await this.audit.log(s, { action: 'media.category_create', targetType: 'media_category', targetId: row.id, summary: `Added media category “${row.name}”` });
    return { id: row.id, name: row.name };
  }

  async removeCategory(s: CompanySession, id: string): Promise<{ ok: true }> {
    const row = await findOwned(this.db, mediaCategories, s.companyId, id, 'Category');
    await this.db.delete(mediaCategories).where(eq(mediaCategories.id, row.id));
    await this.audit.log(s, { action: 'media.category_delete', targetType: 'media_category', targetId: row.id, summary: `Deleted media category “${row.name}”` });
    return { ok: true };
  }
}
