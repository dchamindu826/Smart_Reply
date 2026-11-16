/**
 * Processes one stored Meta webhook event. Runs in the worker. Safe to run twice:
 * messages are unique by WhatsApp message id, statuses only move forward, and calls are
 * unique by WhatsApp call id.
 */
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { MEDIA_LIMITS, maskPhone } from '@smart-reply/shared';
import { Audit } from '../common/audit';
import { InboxService, previewOf } from '../core/inbox.service';
import { MessagingService } from '../core/messaging.service';
import type { Db } from '../db/client';
import { broadcastRecipients, contacts, messageAttachments, messages, usageDaily, webhookEvents, whatsappAccounts } from '../db/schema';
import { InjectDb } from '../infra/db';
import { logger } from '../infra/logger';
import { Queues } from '../infra/queues';
import { FilesService } from '../core/files.service';
import { WhatsappAccounts } from '../meta/platform';
import { AiEngine } from '../modules/ai/ai.engine';
import { CallsEngine } from '../modules/calls/calls.engine';
import { BroadcastRunner } from '../modules/content/broadcast.runner';
import { TemplateSync } from '../modules/content/template-sync';
import { PushService } from '../core/push.service';

interface WaContact {
  wa_id?: string;
  user_id?: string;
  profile?: { name?: string; username?: string };
}

interface WaMessage {
  id: string;
  from?: string;
  from_user_id?: string;
  timestamp?: string;
  type: string;
  context?: { id?: string; from?: string; forwarded?: boolean };
  text?: { body?: string };
  image?: WaMedia;
  audio?: WaMedia & { voice?: boolean };
  video?: WaMedia;
  document?: WaMedia & { filename?: string };
  sticker?: WaMedia & { animated?: boolean };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
    call_permission_reply?: { response?: string; is_permanent?: boolean; expiration_timestamp?: string | number };
    nfm_reply?: { body?: string; name?: string };
  };
  button?: { payload?: string; text?: string };
  reaction?: { message_id?: string; emoji?: string };
  referral?: { source_url?: string; headline?: string };
  errors?: { code?: number; title?: string; message?: string }[];
}

interface WaMedia {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

interface WaStatus {
  id: string;
  type?: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  pricing?: { billable?: boolean; category?: string; type?: string };
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

const tsDate = (t?: string | number): Date => {
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

@Injectable()
export class WebhookProcessor {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly whatsapp: WhatsappAccounts,
    private readonly queues: Queues,
    private readonly files: FilesService,
    private readonly audit: Audit,
    private readonly calls: CallsEngine,
    private readonly templates: TemplateSync,
    private readonly broadcasts: BroadcastRunner,
    private readonly push: PushService,
    private readonly ai: AiEngine
  ) {}

  async process(eventId: string): Promise<void> {
    const [ev] = await this.db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).limit(1);
    if (!ev || ev.processedAt) return;
    await this.db.update(webhookEvents).set({ attempts: sql`${webhookEvents.attempts} + 1` }).where(eq(webhookEvents.id, ev.id));
    const payload = ev.payload as { wabaId: string | null; field: string; value: Record<string, unknown> };
    try {
      const companyId = await this.route(ev.phoneNumberId, payload.wabaId);
      if (!companyId) {
        await this.db.update(webhookEvents).set({ processedAt: new Date(), error: 'No company has this number' }).where(eq(webhookEvents.id, ev.id));
        return;
      }
      if (!ev.companyId) await this.db.update(webhookEvents).set({ companyId }).where(eq(webhookEvents.id, ev.id));
      await this.dispatch(companyId, payload.field, payload.value);
      await this.db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, ev.id));
    } catch (err) {
      await this.db
        .update(webhookEvents)
        .set({ error: (err instanceof Error ? err.message : String(err)).slice(0, 500) })
        .where(eq(webhookEvents.id, ev.id));
      throw err;
    }
  }

  private async route(phoneNumberId: string | null, wabaId: string | null): Promise<string | null> {
    if (phoneNumberId) {
      const acc = await this.whatsapp.byPhoneNumberId(phoneNumberId);
      if (acc) return acc.companyId;
    }
    if (wabaId) {
      const [acc] = await this.db.select({ companyId: whatsappAccounts.companyId }).from(whatsappAccounts).where(eq(whatsappAccounts.wabaId, wabaId)).limit(1);
      if (acc) return acc.companyId;
    }
    return null;
  }

  private async dispatch(companyId: string, field: string, value: Record<string, unknown>): Promise<void> {
    switch (field) {
      case 'messages': {
        const waContacts = (value.contacts as WaContact[] | undefined) ?? [];
        for (const m of (value.messages as WaMessage[] | undefined) ?? []) await this.inbound(companyId, m, waContacts);
        for (const st of (value.statuses as WaStatus[] | undefined) ?? []) await this.status(companyId, st);
        return;
      }
      case 'calls': {
        await this.calls.handleCallWebhook(companyId, value);
        for (const st of (value.statuses as WaStatus[] | undefined) ?? []) await this.calls.handleCallStatus(companyId, st as unknown as Record<string, unknown>);
        return;
      }
      case 'message_template_status_update':
      case 'message_template_quality_update':
      case 'message_template_components_update':
      case 'template_category_update':
        await this.templates.applyWebhook(companyId, field, value);
        return;
      case 'phone_number_quality_update': {
        const limit = (value.max_daily_conversations_per_business ?? value.current_limit) as string | number | undefined;
        await this.db
          .update(whatsappAccounts)
          .set({ ...(limit !== undefined ? { messagingLimit: String(limit) } : {}) })
          .where(eq(whatsappAccounts.companyId, companyId));
        await this.audit.system(companyId, {
          kind: 'meta',
          action: 'number.quality_update',
          targetType: 'whatsapp_account',
          summary: `Meta: ${String(value.event ?? 'quality update')}${limit !== undefined ? ` · limit ${String(limit)}` : ''}`
        });
        return;
      }
      case 'phone_number_name_update': {
        const decision = value.decision as string | undefined;
        if (decision) await this.db.update(whatsappAccounts).set({ nameStatus: decision }).where(eq(whatsappAccounts.companyId, companyId));
        await this.audit.system(companyId, { kind: 'meta', action: 'number.name_update', targetType: 'whatsapp_account', summary: `Meta: display name ${decision ?? 'updated'}` });
        return;
      }
      default:
        await this.audit.system(companyId, {
          kind: 'meta',
          action: `meta.${field}`,
          targetType: 'whatsapp_account',
          summary: `Meta: ${field}${value.event ? ` · ${String(value.event)}` : ''}`,
          meta: { event: value.event ?? null }
        });
    }
  }

  private describe(m: WaMessage): { type: string; body: string; media: (WaMedia & { filename?: string; voice?: boolean }) | null; buttons: string[] } {
    switch (m.type) {
      case 'text':
        return { type: 'text', body: m.text?.body ?? '', media: null, buttons: [] };
      case 'image':
        return { type: 'image', body: m.image?.caption ?? '', media: m.image ?? null, buttons: [] };
      case 'video':
        return { type: 'video', body: m.video?.caption ?? '', media: m.video ?? null, buttons: [] };
      case 'audio':
        return { type: 'audio', body: '', media: m.audio ? { ...m.audio, voice: m.audio.voice } : null, buttons: [] };
      case 'document':
        return { type: 'document', body: m.document?.caption ?? '', media: m.document ?? null, buttons: [] };
      case 'sticker':
        return { type: 'sticker', body: '', media: m.sticker ?? null, buttons: [] };
      case 'location': {
        const l = m.location ?? {};
        const where = [l.name, l.address].filter(Boolean).join(', ');
        return { type: 'location', body: `${where ? where + ' · ' : ''}https://maps.google.com/?q=${l.latitude},${l.longitude}`, media: null, buttons: [] };
      }
      case 'contacts': {
        const list = (m.contacts ?? []).map(c => `${c.name?.formatted_name ?? 'Contact'}${c.phones?.[0]?.phone ? ` ${c.phones[0].phone}` : ''}`);
        return { type: 'contacts', body: list.join('\n'), media: null, buttons: [] };
      }
      case 'button':
        return { type: 'text', body: m.button?.text ?? m.button?.payload ?? '', media: null, buttons: [] };
      case 'interactive': {
        const i = m.interactive ?? {};
        if (i.type === 'button_reply') return { type: 'text', body: i.button_reply?.title ?? '', media: null, buttons: [] };
        if (i.type === 'list_reply') return { type: 'text', body: i.list_reply?.title ?? '', media: null, buttons: [] };
        if (i.type === 'nfm_reply') return { type: 'text', body: i.nfm_reply?.body ?? 'Form reply', media: null, buttons: [] };
        if (i.type === 'call_permission_reply') {
          const ok = i.call_permission_reply?.response === 'accept';
          return { type: 'system', body: ok ? 'Customer allowed WhatsApp calls' : 'Customer declined WhatsApp calls', media: null, buttons: [] };
        }
        return { type: 'interactive', body: 'Interactive reply', media: null, buttons: [] };
      }
      case 'reaction':
        return { type: 'reaction', body: m.reaction?.emoji ? `Reacted ${m.reaction.emoji}` : 'Removed a reaction', media: null, buttons: [] };
      default:
        return { type: 'unsupported', body: 'This message type is not supported in Smart Reply yet. Open WhatsApp on the phone to see it.', media: null, buttons: [] };
    }
  }

  private async inbound(companyId: string, m: WaMessage, waContacts: WaContact[]): Promise<void> {
    const waId = m.from ?? null;
    const bsuid = m.from_user_id ?? null;
    const c = waContacts.find(x => (waId && x.wa_id === waId) || (bsuid && x.user_id === bsuid));
    const { contact, created } = await this.inbox.ensureContact(companyId, {
      waId,
      bsuid,
      profileName: c?.profile?.name,
      username: c?.profile?.username ?? null
    });
    const conv = await this.inbox.ensureConversation(companyId, contact.id);
    const at = tsDate(m.timestamp);
    const d = this.describe(m);

    let replyToId: string | null = null;
    if (m.context?.id) {
      const [r] = await this.db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.companyId, companyId), eq(messages.waMessageId, m.context.id)))
        .limit(1);
      replyToId = r?.id ?? null;
    }

    const isPermissionReply = m.type === 'interactive' && m.interactive?.type === 'call_permission_reply';
    const [row] = await this.db
      .insert(messages)
      .values({
        companyId,
        conversationId: conv.id,
        direction: isPermissionReply ? 'system' : 'in',
        type: d.type,
        body: d.body,
        waMessageId: m.id,
        senderKind: isPermissionReply ? 'system' : 'customer',
        replyToId,
        status: 'delivered',
        raw: { type: m.type, referral: m.referral ?? null },
        createdAt: at
      })
      .onConflictDoNothing({ target: [messages.companyId, messages.waMessageId] })
      .returning();
    if (!row) return; // Already processed.

    if (isPermissionReply) {
      const r = m.interactive!.call_permission_reply!;
      const exp = r.expiration_timestamp ? tsDate(r.expiration_timestamp) : null;
      await this.calls.handlePermissionReply(companyId, contact.id, { response: r.response ?? 'reject', isPermanent: Boolean(r.is_permanent), expiresAt: exp });
      await this.inbox.emitMessage(companyId, row.id);
      await this.inbox.emitContact(companyId, contact.id);
      return;
    }

    if (d.type === 'reaction') {
      // A reaction does not reopen the chat or count as unread.
      await this.inbox.emitMessage(companyId, row.id);
      return;
    }

    if (d.media?.id) {
      const kind = d.type as keyof typeof MEDIA_LIMITS;
      void kind;
      await this.queues.add(
        'media.download',
        {
          messageId: row.id,
          waMediaId: d.media.id,
          companyId,
          mime: d.media.mime_type ?? 'application/octet-stream',
          fileName: d.media.filename ?? null,
          voice: Boolean(d.media.voice)
        },
        { jobId: `media-${row.id}`, attempts: 6 }
      );
    }

    await this.inbox.touch(conv.id, { preview: previewOf(d.type, d.body, d.media?.filename), at, inbound: true });
    // A customer who writes first may be called back (Meta grants permission on their call, not on messages).
    if (created) logger.info({ contact: maskPhone(waId ?? ''), companyId }, 'New customer');

    await this.broadcasts.onReply(companyId, contact.id);
    await this.inbox.emitMessage(companyId, row.id);
    await this.inbox.emitConversation(companyId, conv.id);
    await this.queues.add('automation.inbound', { messageId: row.id }, { jobId: `auto-${row.id}` });

    const [fresh] = await this.db.select({ owner: contacts.ownerUserId, name: contacts.name, profileName: contacts.profileName }).from(contacts).where(eq(contacts.id, contact.id)).limit(1);
    if (fresh?.owner) {
      await this.push.notify([fresh.owner], fresh.name || fresh.profileName || 'New message', previewOf(d.type, d.body, d.media?.filename), {
        conversationId: conv.id,
        kind: 'message'
      });
    }
    void this.ai;
  }

  private async status(companyId: string, st: WaStatus): Promise<void> {
    if (st.type === 'call') {
      await this.calls.handleCallStatus(companyId, st as unknown as Record<string, unknown>);
      return;
    }
    if (!['sent', 'delivered', 'read', 'failed', 'played'].includes(st.status)) return;
    const err = st.errors?.[0];
    const errorText = err ? `${err.title ?? err.message ?? 'Failed'}${err.error_data?.details ? `: ${err.error_data.details}` : ''}${err.code ? ` (${err.code})` : ''}` : null;
    const before = await this.db
      .select({ deliveredAt: messages.deliveredAt, pricingCategory: messages.pricingCategory })
      .from(messages)
      .where(and(eq(messages.companyId, companyId), eq(messages.waMessageId, st.id)))
      .limit(1);
    const updated = await this.messaging.applyStatus(
      companyId,
      st.id,
      st.status as 'sent' | 'delivered' | 'read' | 'failed' | 'played',
      tsDate(st.timestamp),
      errorText,
      st.pricing ? { category: st.pricing.category, billable: st.pricing.billable } : null
    );
    if (!updated) return;

    // Count each message once in usage, when it is first delivered.
    const firstDelivery = before[0] && !before[0].deliveredAt && updated.deliveredAt;
    if (firstDelivery) {
      const category = updated.pricingCategory ?? st.pricing?.category ?? (updated.type === 'template' ? 'utility' : 'service');
      const billable = updated.billable ?? (st.pricing?.billable ?? (st.pricing?.type ? st.pricing.type === 'regular' : category !== 'service'));
      const date = (updated.deliveredAt ?? new Date()).toISOString().slice(0, 10);
      await this.db
        .insert(usageDaily)
        .values({ companyId, date, category, deliveredCount: 1, billableCount: billable ? 1 : 0 })
        .onConflictDoUpdate({
          target: [usageDaily.companyId, usageDaily.date, usageDaily.category],
          set: {
            deliveredCount: sql`${usageDaily.deliveredCount} + 1`,
            billableCount: sql`${usageDaily.billableCount} + ${billable ? 1 : 0}`
          }
        });
    }
    const [rec] = await this.db.select({ b: broadcastRecipients.broadcastId }).from(broadcastRecipients).where(eq(broadcastRecipients.messageId, updated.id)).limit(1);
    if (rec) await this.broadcasts.onMessageStatus(updated.id, updated.status);
  }

  /** `media.download`: copy the customer's file into our storage (Meta's ids and links expire). */
  async downloadMedia(job: { messageId: string; waMediaId: string; companyId: string; mime: string; fileName: string | null; voice: boolean }): Promise<void> {
    const [existing] = await this.db.select().from(messageAttachments).where(eq(messageAttachments.messageId, job.messageId)).limit(1);
    if (existing) return;
    const [msg] = await this.db.select().from(messages).where(eq(messages.id, job.messageId)).limit(1);
    if (!msg) return;
    const wa = await this.whatsapp.require(job.companyId);
    const info = await wa.graph.mediaInfo(job.waMediaId);
    const mime = (info.mime_type || job.mime).split(';')[0].trim();
    const kind = (['image', 'audio', 'video', 'document', 'sticker'].includes(msg.type) ? msg.type : 'document') as keyof typeof MEDIA_LIMITS;
    const bytes = await wa.graph.downloadMedia(info.url, MEDIA_LIMITS[kind].max + 1024);
    const ext = mime.split('/')[1]?.replace('mpeg', 'mp3').replace('quicktime', 'mov') ?? 'bin';
    const name = job.fileName || `${kind}-${msg.createdAt.toISOString().slice(0, 19).replace(/[:T]/g, '')}.${ext}`;
    const file = await this.files.storeBuffer(job.companyId, {
      name,
      mime,
      bytes,
      purpose: 'message',
      kind,
      voice: job.voice,
      waMediaId: job.waMediaId,
      sha256: info.sha256
    });
    await this.db.insert(messageAttachments).values({ messageId: msg.id, fileId: file.id, companyId: job.companyId, position: 0 }).onConflictDoNothing();
    await this.inbox.emitMessage(job.companyId, msg.id);
  }
}
