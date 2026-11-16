import { Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { QuickReply, quickReplySchema, updateQuickReplySchema } from '@smart-reply/shared';
import { Auth } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody } from '../../common/validation';
import { QuickRepliesService } from './quick-replies.service';

@Controller('quick-replies')
export class QuickRepliesController {
  constructor(private readonly svc: QuickRepliesService) {}

  @Get()
  list(@Auth() s: CompanySession): Promise<QuickReply[]> {
    return this.svc.list(s);
  }

  @Post()
  create(@Auth() s: CompanySession, @ZBody(quickReplySchema) body: z.infer<typeof quickReplySchema>): Promise<QuickReply> {
    return this.svc.create(s, body);
  }

  @Patch(':id')
  update(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(updateQuickReplySchema) body: z.infer<typeof updateQuickReplySchema>): Promise<QuickReply> {
    return this.svc.update(s, id, body);
  }

  @Delete(':id')
  remove(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.remove(s, id);
  }
}
