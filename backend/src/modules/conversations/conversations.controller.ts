import { Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  Conversation,
  ConversationCounts,
  Message,
  Page,
  botStateSchema,
  conversationListQuery,
  conversationStateSchema,
  noteSchema,
  sendMessageSchema,
  sendProductSchema,
  sendTemplateSchema,
  startConversationSchema
} from '@smart-reply/shared';
import { Auth } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly svc: ConversationsService) {}

  @Get()
  list(@Auth() s: CompanySession, @ZQuery(conversationListQuery) q: z.infer<typeof conversationListQuery>): Promise<Page<Conversation>> {
    return this.svc.list(s, q);
  }

  @Get('counts')
  counts(@Auth() s: CompanySession): Promise<ConversationCounts> {
    return this.svc.counts(s);
  }

  @Post()
  start(@Auth() s: CompanySession, @ZBody(startConversationSchema) body: z.infer<typeof startConversationSchema>): Promise<Conversation> {
    return this.svc.start(s, body);
  }

  @Get('by-contact/:contactId')
  byContact(@Auth() s: CompanySession, @Param('contactId') contactId: string): Promise<Conversation> {
    return this.svc.ensureForContact(s, contactId);
  }

  @Get(':id')
  get(@Auth() s: CompanySession, @Param('id') id: string): Promise<Conversation> {
    return this.svc.get(s, id);
  }

  @Get(':id/messages')
  messages(@Auth() s: CompanySession, @Param('id') id: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string): Promise<Page<Message>> {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.svc.messages(s, id, cursor, n);
  }

  @Get(':id/media')
  media(@Auth() s: CompanySession, @Param('id') id: string): Promise<Message[]> {
    return this.svc.media(s, id);
  }

  @Post(':id/messages')
  send(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(sendMessageSchema) body: z.infer<typeof sendMessageSchema>): Promise<Message[]> {
    return this.svc.send(s, id, body);
  }

  @Post(':id/notes')
  note(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(noteSchema) body: z.infer<typeof noteSchema>): Promise<Message> {
    return this.svc.note(s, id, body.text, body.fileIds);
  }

  @Post(':id/templates')
  template(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(sendTemplateSchema) body: z.infer<typeof sendTemplateSchema>): Promise<Message> {
    return this.svc.sendTemplate(s, id, body.templateId, body.variables);
  }

  @Post(':id/products')
  product(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(sendProductSchema) body: z.infer<typeof sendProductSchema>): Promise<Message[]> {
    return this.svc.sendProduct(s, id, body.productId);
  }

  @Post(':id/quick-replies/:quickReplyId')
  quickReply(@Auth() s: CompanySession, @Param('id') id: string, @Param('quickReplyId') qrId: string): Promise<Message[]> {
    return this.svc.sendQuickReply(s, id, qrId);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.svc.markRead(s, id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@Auth() s: CompanySession, @Param('id') id: string): Promise<Conversation> {
    return this.svc.setStatus(s, id, 'resolved');
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@Auth() s: CompanySession, @Param('id') id: string): Promise<Conversation> {
    return this.svc.setStatus(s, id, 'open');
  }

  @Put(':id/state')
  state(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(conversationStateSchema) body: z.infer<typeof conversationStateSchema>): Promise<Conversation> {
    return this.svc.setState(s, id, body);
  }

  @Post(':id/bot')
  @HttpCode(200)
  bot(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(botStateSchema) body: z.infer<typeof botStateSchema>): Promise<Conversation> {
    return this.svc.setBot(s, id, body.active);
  }
}
