import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  MediaCategory,
  MediaItem,
  favoriteSchema,
  mediaCategorySchema,
  mediaItemSchema,
  mediaQuery,
  updateMediaSchema
} from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly svc: MediaService) {}

  @Get()
  list(
    @Auth() s: CompanySession,
    @ZQuery(mediaQuery) q: z.infer<typeof mediaQuery>,
    @Query('favorites') favorites?: string
  ): Promise<MediaItem[]> {
    return this.svc.list(s, q, favorites === 'true' || favorites === '1');
  }

  @Get('categories')
  categories(@Auth() s: CompanySession): Promise<MediaCategory[]> {
    return this.svc.categories(s);
  }

  @Post('categories')
  @Roles('manager')
  createCategory(@Auth() s: CompanySession, @ZBody(mediaCategorySchema) body: z.infer<typeof mediaCategorySchema>): Promise<MediaCategory> {
    return this.svc.createCategory(s, body);
  }

  @Delete('categories/:id')
  @Roles('manager')
  removeCategory(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.removeCategory(s, id);
  }

  @Get(':id')
  get(@Auth() s: CompanySession, @Param('id') id: string): Promise<MediaItem> {
    return this.svc.get(s, id);
  }

  @Post()
  @Roles('manager')
  create(@Auth() s: CompanySession, @ZBody(mediaItemSchema) body: z.infer<typeof mediaItemSchema>): Promise<MediaItem> {
    return this.svc.create(s, body);
  }

  @Patch(':id')
  @Roles('manager')
  update(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(updateMediaSchema) body: z.infer<typeof updateMediaSchema>): Promise<MediaItem> {
    return this.svc.update(s, id, body);
  }

  @Delete(':id')
  @Roles('manager')
  remove(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.remove(s, id);
  }

  @Put(':id/favorite')
  favorite(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(favoriteSchema) body: z.infer<typeof favoriteSchema>): Promise<MediaItem> {
    return this.svc.favorite(s, id, body.favorite);
  }

  /** Counts a share; the client then sends the file in the chat with `POST /conversations/:id/messages`. */
  @Post(':id/share')
  @HttpCode(200)
  share(@Auth() s: CompanySession, @Param('id') id: string): Promise<MediaItem> {
    return this.svc.share(s, id);
  }

  @Post(':id/download')
  @HttpCode(200)
  download(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ url: string }> {
    return this.svc.download(s, id);
  }
}
