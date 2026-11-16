/**
 * Outgoing WhatsApp messages. The API writes the message as `queued` and returns at once;
 * the `message.send` job (worker) calls Meta and moves the status forward.
 */
import { Global, Injectable, Module } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { fillTemplate } from '@smart-reply/shared';
import { AppError, notFound } from '../common/errors';
import type { Db, DbOrTx } from '../db/client';
import { contacts, conversations, files, messageAttachments, messages, templates } from '../db/schema';
import { InjectDb } from '../infra/db';
import { logger } from '../infra/logger';
import { Queues } from '../infra/queues';
import { Realtime } from '../infra/realtime';
import { Storage } from '../infra/storage';
import { GraphError } from '../meta/graph';
import { WhatsappAccounts } from '../meta/platform';
import { needsVoiceConversion, toOggOpus } from './audio';
import { FileRow, FilesService } from './files.service';
import { ContactRow, ConversationRow, InboxService, MessageRow, previewOf } from './inbox.service';

export interface Sender {
  userId: string | null;
  kind: 'user' | 'bot' | 'system';
}

const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
/** Re-upload media to Meta when our copy of its media id is older than this (ids last 30 days). */
const MEDIA_ID_MAX_AGE_MS = 25 * 24 * 3600_000;

export function windowOpen(conv: Pick<ConversationRow, 'windowExpiresAt'>, now = new Date()): boolean {
  return conv.windowExpiresAt !== null && conv.windowExpiresAt.getTime() > now.getTime();
}

@Injectable()
export class MessagingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly queues: Queues,
    private readonly inbox: InboxService,
    private readonly filesSvc: FilesService,
    private readonly storage: Storage,
    private readonly whatsapp: WhatsappAccounts,
    private readonly realtime: Realtime
  ) {}

  private assertCanMessage(contact: ContactRow): void {
    if (contact.blockedAt) throw new AppError('CONFLICT', 'This customer is blocked. Unblock them to send messages.');
    if (!contact.waId && !contact.bsuid) throw new AppError('BAD_REQUEST', 'This customer has no WhatsApp number.');
  }

  /**
   * Free-form message (text and/or files). Allowed only inside the 24-hour window.
   * Several files become several WhatsApp messages; the text rides as the caption of the
   * first image, video or document, or goes as its own text message.
   */
  async sendFreeForm(
    companyId: string,
    conv: ConversationRow,
    contact: ContactRow,
    input: { text: string; fileIds: string[]; replyToId?: string; voice?: boolean },
    sender: Sender,
    opts: { quickReplyId?: string } = {}
  ): Promise<MessageRow[]> {
    this.assertCanMessage(contact);
    if (!windowOpen(conv)) {
      throw new AppError('WINDOW_CLOSED', 'More than 24 hours since the customer’s last message. Send an approved template instead.');
    }
    await this.whatsapp.require(companyId);
    const fileRows = await this.filesSvc.requireUploaded(companyId, input.fileIds);
    const created: MessageRow[] = [];
    let text = input.text.trim();

    await this.db.transaction(async tx => {
      const insert = async (type: string, body: string, file: FileRow | null) => {
        const [row] = await tx
          .insert(messages)
          .values({
            companyId,
            conversationId: conv.id,
            direction: 'out',
            type,
            body,
            senderUserId: sender.userId,
            senderKind: sender.kind,
            replyToId: created.length === 0 ? (input.replyToId ?? null) : null,
            status: 'queued'
          })
          .returning();
        if (file) {
          await tx.insert(messageAttachments).values({ messageId: row.id, fileId: file.id, companyId, position: 0 });
          if (input.voice && file.kind === 'audio') await tx.update(files).set({ voice: true }).where(eq(files.id, file.id));
        }
        created.push(row);
      };

      for (const f of fileRows) {
        const captionable = f.kind === 'image' || f.kind === 'video' || f.kind === 'document';
        if (captionable && text) {
          await insert(f.kind, text.slice(0, 1024), f);
          text = text.length > 1024 ? text.slice(1024) : '';
        } else {
          await insert(f.kind, '', f);
        }
      }
      if (text) await insert('text', text, null);

      const last = created[created.length - 1];
      const lastFile = fileRows[fileRows.length - 1];
      await this.inbox.touch(conv.id, { preview: previewOf(last.type, last.body, lastFile?.name), at: last.createdAt, inbound: false }, tx);
      if (sender.kind === 'user' && !conv.firstResponseAt) {
        await tx.update(conversations).set({ firstResponseAt: new Date() }).where(eq(conversations.id, conv.id));
      }
    });

    for (const m of created) {
      await this.queues.add('message.send', { messageId: m.id }, { jobId: `send-${m.id}` });
      await this.inbox.emitMessage(companyId, m.id);
    }
    await this.inbox.emitConversation(companyId, conv.id);
    void opts;
    return created;
  }

  /** Approved template, allowed at any time. Variables fill `{{1}}`, `{{2}}` … in the body. */
  async sendTemplate(
    companyId: string,
    conv: ConversationRow,
    contact: ContactRow,
    input: { templateId: string; variables: string[] },
    sender: Sender,
    tx?: DbOrTx
  ): Promise<MessageRow> {
    this.assertCanMessage(contact);
    const db = tx ?? this.db;
    const [tpl] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, input.templateId), eq(templates.companyId, companyId)))
      .limit(1);
    if (!tpl) throw notFound('Template');
    if (tpl.status !== 'approved') throw new AppError('TEMPLATE_NOT_APPROVED', `Template “${tpl.name}” is not approved by Meta yet.`);
    if (tpl.category === 'marketing' && !contact.marketingOptIn) {
      throw new AppError('CONFLICT', 'This customer has not agreed to marketing messages.');
    }
    const body = fillTemplate(tpl.body, input.variables);
    const [row] = await db
      .insert(messages)
      .values({
        companyId,
        conversationId: conv.id,
        direction: 'out',
        type: 'template',
        body,
        senderUserId: sender.userId,
        senderKind: sender.kind,
        templateId: tpl.id,
        templateName: tpl.name,
        buttons: tpl.buttons.map(b => b.text),
        raw: { variables: input.variables },
        status: 'queued'
      })
      .returning();
    await db.update(templates).set({ usedCount: sql`${templates.usedCount} + 1` }).where(eq(templates.id, tpl.id));
    await this.inbox.touch(conv.id, { preview: `Template · ${tpl.name}`, at: row.createdAt, inbound: false }, db);
    if (!tx) await this.afterQueued(companyId, conv.id, row.id);
    return row;
  }

  /** Call after a transaction that queued messages commits. */
  async afterQueued(companyId: string, conversationId: string, messageId: string): Promise<void> {
    await this.queues.add('message.send', { messageId }, { jobId: `send-${messageId}` });
    await this.inbox.emitMessage(companyId, messageId);
    await this.inbox.emitConversation(companyId, conversationId);
  }

  /** WhatsApp's interactive "allow calls" request. */
  async sendCallPermissionRequest(companyId: string, conv: ConversationRow, contact: ContactRow, sender: Sender, text: string): Promise<MessageRow> {
    this.assertCanMessage(contact);
    if (!windowOpen(conv)) throw new AppError('WINDOW_CLOSED', 'Outside the 24-hour window. Send the call permission template instead.');
    const [row] = await this.db
      .insert(messages)
      .values({
        companyId,
        conversationId: conv.id,
        direction: 'out',
        type: 'interactive',
        body: text,
        senderUserId: sender.userId,
        senderKind: sender.kind,
        buttons: ['Allow calls'],
        raw: { interactive: 'call_permission_request' },
        status: 'queued'
      })
      .returning();
    await this.inbox.touch(conv.id, { preview: text, at: row.createdAt, inbound: false });
    await this.afterQueued(companyId, conv.id, row.id);
    return row;
  }

  /* ───────── Worker side ───────── */

  private async mediaIdFor(companyId: string, file: FileRow): Promise<string> {
    if (file.waMediaId && file.waMediaUploadedAt && Date.now() - file.waMediaUploadedAt.getTime() < MEDIA_ID_MAX_AGE_MS) {
      return file.waMediaId;
    }
    const wa = await this.whatsapp.require(companyId);
    let bytes = await this.storage.get(file.storageKey);
    let mime = file.mime;
    let name = file.name;
    // WhatsApp does not accept WebM audio, and shows a voice message only for OGG/Opus.
    if (file.kind === 'audio' && (mime === 'audio/webm' || (file.voice && needsVoiceConversion(mime)))) {
      bytes = await toOggOpus(bytes, mime);
      mime = 'audio/ogg';
      name = name.replace(/\.[a-z0-9]+$/i, '') + '.ogg';
      await this.db.update(files).set({ mime, name }).where(eq(files.id, file.id));
      file.mime = mime;
    }
    const id = await wa.graph.uploadMedia(wa.phoneNumberId, bytes, mime, name);
    await this.db.update(files).set({ waMediaId: id, waMediaUploadedAt: new Date() }).where(eq(files.id, file.id));
    return id;
  }

  private async payloadFor(m: MessageRow, contact: ContactRow): Promise<Record<string, unknown>> {
    const context = m.replyToId ? await this.replyContext(m.replyToId) : undefined;
    const withContext = (p: Record<string, unknown>) => (context ? { ...p, context: { message_id: context } } : p);
    if (m.type === 'text') return withContext({ type: 'text', text: { preview_url: true, body: m.body } });
    if (m.type === 'template') {
      const [tpl] = await this.db.select().from(templates).where(eq(templates.id, m.templateId!)).limit(1);
      if (!tpl) throw new GraphError('Template deleted', 400, null, 'Template no longer exists');
      const vars = ((m.raw as { variables?: string[] } | null)?.variables ?? []).map(v => ({ type: 'text', text: v || '-' }));
      return {
        type: 'template',
        template: {
          name: tpl.name,
          language: { code: tpl.language },
          components: vars.length ? [{ type: 'body', parameters: vars }] : []
        }
      };
    }
    if (m.type === 'interactive') {
      return {
        type: 'interactive',
        interactive: { type: 'call_permission_request', action: { name: 'call_permission_request' }, body: { text: m.body } }
      };
    }
    const [att] = await this.db
      .select({ file: files })
      .from(messageAttachments)
      .innerJoin(files, eq(files.id, messageAttachments.fileId))
      .where(eq(messageAttachments.messageId, m.id))
      .limit(1);
    if (!att) throw new GraphError('Attachment missing', 400, null, 'The file was deleted');
    const mediaId = await this.mediaIdFor(m.companyId, att.file);
    void contact;
    switch (m.type) {
      case 'image':
        return withContext({ type: 'image', image: { id: mediaId, ...(m.body ? { caption: m.body } : {}) } });
      case 'video':
        return withContext({ type: 'video', video: { id: mediaId, ...(m.body ? { caption: m.body } : {}) } });
      case 'document':
        return withContext({ type: 'document', document: { id: mediaId, filename: att.file.name, ...(m.body ? { caption: m.body } : {}) } });
      case 'audio':
        return withContext({ type: 'audio', audio: { id: mediaId, ...(att.file.voice && att.file.mime === 'audio/ogg' ? { voice: true } : {}) } });
      case 'sticker':
        return { type: 'sticker', sticker: { id: mediaId } };
      default:
        throw new GraphError(`Cannot send ${m.type}`, 400, null, null);
    }
  }

  private async replyContext(replyToId: string): Promise<string | undefined> {
    const [r] = await this.db.select({ wa: messages.waMessageId }).from(messages).where(eq(messages.id, replyToId)).limit(1);
    return r?.wa ?? undefined;
  }

  /** Runs in the worker for `message.send`. Safe to run twice: a sent message is skipped. */
  async deliver(messageId: string, attempt: number, maxAttempts: number): Promise<void> {
    const [m] = await this.db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!m || m.direction !== 'out' || m.status !== 'queued') return;
    const [contact] = await this.db
      .select({ c: contacts })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(eq(conversations.id, m.conversationId))
      .limit(1)
      .then(r => r.map(x => x.c));
    if (!contact) return;
    try {
      const wa = await this.whatsapp.require(m.companyId);
      const payload = await this.payloadFor(m, contact);
      const { id } = await wa.graph.sendMessage(wa.phoneNumberId, { waId: contact.waId, bsuid: contact.bsuid }, payload);
      await this.db
        .update(messages)
        .set({ status: 'sent', waMessageId: id, sentAt: new Date(), error: null })
        .where(and(eq(messages.id, m.id), eq(messages.status, 'queued')));
      this.emitStatus(m, 'sent', null);
    } catch (err) {
      const permanent = err instanceof GraphError ? err.permanent : err instanceof AppError;
      const last = attempt + 1 >= maxAttempts;
      if (permanent || last) {
        const text = err instanceof GraphError ? err.details || err.message : err instanceof Error ? err.message : 'Send failed';
        await this.db.update(messages).set({ status: 'failed', error: text.slice(0, 500) }).where(eq(messages.id, m.id));
        this.emitStatus(m, 'failed', text);
        logger.warn({ messageId: m.id, code: err instanceof GraphError ? err.code : null }, 'Message failed');
        return;
      }
      throw err;
    }
  }

  emitStatus(m: Pick<MessageRow, 'id' | 'companyId' | 'conversationId'>, status: MessageRow['status'], error: string | null): void {
    void this.db
      .select({ owner: contacts.ownerUserId })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(eq(conversations.id, m.conversationId))
      .limit(1)
      .then(([r]) =>
        this.realtime.emit(this.inbox.roomsFor(m.companyId, r?.owner ?? null), 'message.status', {
          conversationId: m.conversationId,
          messageId: m.id,
          status,
          error
        })
      );
  }

  /** Status from Meta's webhook. Moves forward only: a late "delivered" after "read" is ignored. */
  async applyStatus(
    companyId: string,
    waMessageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed' | 'played',
    at: Date,
    error: string | null,
    pricing: { category?: string; billable?: boolean } | null
  ): Promise<MessageRow | null> {
    const st = status === 'played' ? 'read' : status;
    const [m] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.companyId, companyId), eq(messages.waMessageId, waMessageId)))
      .limit(1);
    if (!m) return null;
    const patch: Partial<MessageRow> = {};
    if (pricing?.category && !m.pricingCategory) patch.pricingCategory = pricing.category;
    if (pricing && typeof pricing.billable === 'boolean' && m.billable === null) patch.billable = pricing.billable;
    const forward = st === 'failed' ? m.status !== 'read' && m.status !== 'delivered' : STATUS_RANK[st] > STATUS_RANK[m.status];
    if (forward) {
      patch.status = st;
      if (st === 'sent') patch.sentAt = m.sentAt ?? at;
      if (st === 'delivered') patch.deliveredAt = at;
      if (st === 'read') {
        patch.readAt = at;
        patch.deliveredAt = m.deliveredAt ?? at;
      }
      if (st === 'failed') patch.error = error;
    }
    if (Object.keys(patch).length === 0) return m;
    const [u] = await this.db.update(messages).set(patch).where(eq(messages.id, m.id)).returning();
    if (forward) this.emitStatus(u, u.status, u.error);
    return u;
  }

  async messagesByIds(ids: string[]): Promise<MessageRow[]> {
    if (!ids.length) return [];
    return this.db.select().from(messages).where(inArray(messages.id, ids));
  }
}

@Global()
@Module({ providers: [MessagingService], exports: [MessagingService] })
export class MessagingCoreModule {}
