import { Injectable } from '@nestjs/common';
import { SQL, and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { AppError } from '../../common/errors';
import { InboxService } from '../../core/inbox.service';
import { MessagingService } from '../../core/messaging.service';
import type { Db, DbOrTx } from '../../db/client';
import { broadcastRecipients, broadcasts, contactLabels, contacts, messages, whatsappAccounts } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { Queues } from '../../infra/queues';
import { Realtime, rooms } from '../../infra/realtime';

export type BroadcastRow = typeof broadcasts.$inferSelect;
type RecipientStatus = (typeof broadcastRecipients.$inferSelect)['status'];

/** Messages per batch; one batch per second keeps us near 20 messages a second. */
const BATCH = 20;
const BATCH_MS = 1000;
const RETRY_AFTER_LIMIT_MS = 3600_000;
const DAY_MS = 24 * 3600_000;
const REPLY_WINDOW_MS = 72 * 3600_000;
const DEFAULT_LIMIT = 250;

/**
 * Meta's business-initiated messaging limit per 24 hours. The phone number reports tiers
 * such as `TIER_250`, `TIER_1K`, `TIER_10K`, `TIER_100K`, `TIER_UNLIMITED`; the quality
 * webhook may report a plain number. Unknown values fall back to the lowest common tier.
 */
export function parseMessagingLimit(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const v = raw.trim().toUpperCase().replace(/^TIER_/, '');
  if (v === 'UNLIMITED') return Number.POSITIVE_INFINITY;
  const m = /^(\d+(?:\.\d+)?)([KM])?$/.exec(v);
  if (!m) return DEFAULT_LIMIT;
  const n = Number(m[1]) * (m[2] === 'K' ? 1000 : m[2] === 'M' ? 1_000_000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_LIMIT;
}

/** Contacts a broadcast may reach: opted in to marketing, not blocked, reachable, with the label. */
export function audienceWhere(companyId: string, labelId: string | null): SQL {
  return and(
    eq(contacts.companyId, companyId),
    eq(contacts.marketingOptIn, true),
    isNull(contacts.blockedAt),
    or(isNotNull(contacts.waId), isNotNull(contacts.bsuid)),
    labelId
      ? sql`exists (select 1 from ${contactLabels} where ${contactLabels.contactId} = ${contacts.id} and ${contactLabels.labelId} = ${labelId})`
      : undefined
  ) as SQL;
}

export interface BroadcastCounts {
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  pending: number;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Sends a broadcast through the queue at a safe rate. */
@Injectable()
export class BroadcastRunner {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly queues: Queues,
    private readonly realtime: Realtime
  ) {}

  /** Copy the current audience into `broadcast_recipients`. Safe to run twice. */
  async snapshot(b: Pick<BroadcastRow, 'id' | 'companyId' | 'labelId'>, tx?: DbOrTx): Promise<number> {
    const db = tx ?? this.db;
    const ids = await db.select({ id: contacts.id }).from(contacts).where(audienceWhere(b.companyId, b.labelId));
    for (let i = 0; i < ids.length; i += 1000) {
      await db
        .insert(broadcastRecipients)
        .values(ids.slice(i, i + 1000).map(c => ({ broadcastId: b.id, contactId: c.id, companyId: b.companyId })))
        .onConflictDoNothing();
    }
    return ids.length;
  }

  async counts(broadcastIds: string[]): Promise<Map<string, BroadcastCounts>> {
    const out = new Map<string, BroadcastCounts>();
    if (!broadcastIds.length) return out;
    const f = (statuses: RecipientStatus[]) =>
      sql<number>`(count(*) filter (where ${broadcastRecipients.status} in (${sql.join(
        statuses.map(s => sql`${s}`),
        sql`, `
      )})))::int`;
    const rows = await this.db
      .select({
        id: broadcastRecipients.broadcastId,
        audience: sql<number>`count(*)::int`,
        sent: f(['sent', 'delivered', 'read', 'replied']),
        delivered: f(['delivered', 'read', 'replied']),
        read: f(['read', 'replied']),
        replied: f(['replied']),
        failed: f(['failed']),
        pending: f(['pending'])
      })
      .from(broadcastRecipients)
      .where(inArray(broadcastRecipients.broadcastId, broadcastIds))
      .groupBy(broadcastRecipients.broadcastId);
    for (const r of rows) out.set(r.id, r);
    return out;
  }

  private async emitProgress(b: Pick<BroadcastRow, 'id' | 'companyId'>, status: BroadcastRow['status']): Promise<void> {
    const c = (await this.counts([b.id])).get(b.id);
    this.realtime.emit([rooms.managers(b.companyId)], 'broadcast.progress', {
      broadcastId: b.id,
      sent: c?.sent ?? 0,
      delivered: c?.delivered ?? 0,
      read: c?.read ?? 0,
      failed: c?.failed ?? 0,
      status
    });
  }

  private async finish(b: BroadcastRow, status: 'done' | 'failed'): Promise<void> {
    await this.db
      .update(broadcasts)
      .set({ status, finishedAt: new Date() })
      .where(and(eq(broadcasts.id, b.id), eq(broadcasts.status, 'sending')));
    if (status === 'failed') {
      await this.db
        .update(broadcastRecipients)
        .set({ status: 'skipped' })
        .where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'pending')));
    }
    await this.emitProgress(b, status);
    logger.info({ broadcastId: b.id, status }, 'Broadcast finished');
  }

  /** Messages sent by this company's broadcasts in the last 24 hours. */
  private async usedToday(companyId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(broadcastRecipients)
      .innerJoin(messages, eq(messages.id, broadcastRecipients.messageId))
      .where(and(eq(broadcastRecipients.companyId, companyId), gt(messages.createdAt, new Date(Date.now() - DAY_MS))));
    return r?.n ?? 0;
  }

  /** `broadcast.run` job. Safe to run twice: each recipient is sent once, under a row lock. */
  async run(broadcastId: string): Promise<void> {
    let [b] = await this.db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
    if (!b) return;
    if (b.status === 'scheduled') {
      if (b.scheduledAt && b.scheduledAt.getTime() > Date.now() + 5000) return; // a delayed job will come
      [b] = await this.db.transaction(async tx => {
        await this.snapshot(b, tx);
        return tx
          .update(broadcasts)
          .set({ status: 'sending', startedAt: new Date() })
          .where(and(eq(broadcasts.id, b.id), eq(broadcasts.status, 'scheduled')))
          .returning();
      });
      if (!b) return;
    }
    if (b.status !== 'sending') return;

    const [account] = await this.db.select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, b.companyId)).limit(1);
    if (!account || account.status === 'disconnected') {
      logger.warn({ broadcastId }, 'Broadcast stopped: WhatsApp not connected');
      return this.finish(b, 'failed');
    }
    let remaining = parseMessagingLimit(account.messagingLimit) - (await this.usedToday(b.companyId));

    for (;;) {
      const [cur] = await this.db.select().from(broadcasts).where(eq(broadcasts.id, b.id)).limit(1);
      if (!cur || cur.status !== 'sending') return;
      const [acc] = await this.db
        .select({ quality: whatsappAccounts.qualityRating })
        .from(whatsappAccounts)
        .where(eq(whatsappAccounts.companyId, b.companyId))
        .limit(1);
      if (acc?.quality?.toUpperCase() === 'RED') {
        logger.warn({ broadcastId }, 'Broadcast stopped: number quality is low');
        return this.finish(cur, 'failed');
      }
      if (remaining <= 0) {
        await this.queues.add('broadcast.run', { broadcastId: b.id }, { jobId: `bc-${b.id}-${Date.now()}`, delay: RETRY_AFTER_LIMIT_MS });
        logger.info({ broadcastId }, 'Broadcast paused at the messaging limit; resumes in an hour');
        await this.emitProgress(cur, 'sending');
        return;
      }
      const batch = await this.db
        .select({ contact: contacts })
        .from(broadcastRecipients)
        .innerJoin(contacts, eq(contacts.id, broadcastRecipients.contactId))
        .where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'pending')))
        .limit(Math.min(BATCH, remaining));
      if (batch.length === 0) return this.finish(cur, 'done');

      const started = Date.now();
      for (const { contact } of batch) {
        const outcome = await this.sendOne(cur, contact);
        if (outcome === 'sent') remaining--;
        if (outcome === 'stop') return this.finish(cur, 'failed');
      }
      await this.emitProgress(cur, 'sending');
      const wait = BATCH_MS - (Date.now() - started);
      if (wait > 0 && batch.length === BATCH) await sleep(wait);
    }
  }

  private async sendOne(b: BroadcastRow, contact: typeof contacts.$inferSelect): Promise<'sent' | 'skipped' | 'failed' | 'stop'> {
    const where = and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.contactId, contact.id), eq(broadcastRecipients.status, 'pending'));
    if (contact.blockedAt || !contact.marketingOptIn || (!contact.waId && !contact.bsuid)) {
      await this.db.update(broadcastRecipients).set({ status: 'skipped' }).where(where);
      return 'skipped';
    }
    try {
      const sent = await this.db.transaction(async tx => {
        const [locked] = await tx.select().from(broadcastRecipients).where(where).for('update', { skipLocked: true }).limit(1);
        if (!locked) return null;
        const conv = await this.inbox.ensureConversation(b.companyId, contact.id, tx);
        const m = await this.messaging.sendTemplate(
          b.companyId,
          conv,
          contact,
          { templateId: b.templateId, variables: b.variables },
          { userId: b.createdBy, kind: 'user' },
          tx
        );
        await tx.update(broadcastRecipients).set({ status: 'sent', messageId: m.id, error: null }).where(where);
        return { conversationId: conv.id, messageId: m.id };
      });
      if (!sent) return 'skipped';
      await this.messaging.afterQueued(b.companyId, sent.conversationId, sent.messageId);
      return 'sent';
    } catch (err) {
      if (err instanceof AppError && (err.code === 'TEMPLATE_NOT_APPROVED' || err.code === 'NOT_FOUND')) {
        logger.warn({ broadcastId: b.id, code: err.code }, 'Broadcast stopped: template unavailable');
        return 'stop';
      }
      const text = err instanceof Error ? err.message : 'Send failed';
      await this.db.update(broadcastRecipients).set({ status: 'failed', error: text.slice(0, 500) }).where(where);
      if (!(err instanceof AppError)) logger.warn({ broadcastId: b.id, err: text }, 'Broadcast recipient failed');
      return 'failed';
    }
  }

  /** Message status from Meta for a broadcast message. Moves forward only. */
  async onMessageStatus(messageId: string, status: string): Promise<void> {
    const lower: Record<string, RecipientStatus[]> = {
      sent: ['pending'],
      delivered: ['pending', 'sent'],
      read: ['pending', 'sent', 'delivered'],
      failed: ['pending', 'sent']
    };
    const from = lower[status];
    if (!from) return;
    const [u] = await this.db
      .update(broadcastRecipients)
      .set({ status: status as RecipientStatus })
      .where(and(eq(broadcastRecipients.messageId, messageId), inArray(broadcastRecipients.status, from)))
      .returning();
    if (!u) return;
    const [b] = await this.db.select().from(broadcasts).where(eq(broadcasts.id, u.broadcastId)).limit(1);
    if (b) await this.emitProgress(b, b.status);
  }

  /** A customer wrote: the latest broadcast they got in the last 72 hours counts a reply. */
  async onReply(companyId: string, contactId: string): Promise<void> {
    const [r] = await this.db
      .select({ broadcastId: broadcastRecipients.broadcastId, status: broadcastRecipients.status })
      .from(broadcastRecipients)
      .innerJoin(messages, eq(messages.id, broadcastRecipients.messageId))
      .where(
        and(
          eq(broadcastRecipients.companyId, companyId),
          eq(broadcastRecipients.contactId, contactId),
          inArray(broadcastRecipients.status, ['sent', 'delivered', 'read', 'replied']),
          gt(messages.createdAt, new Date(Date.now() - REPLY_WINDOW_MS))
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (!r || r.status === 'replied') return;
    await this.db
      .update(broadcastRecipients)
      .set({ status: 'replied' })
      .where(and(eq(broadcastRecipients.broadcastId, r.broadcastId), eq(broadcastRecipients.contactId, contactId)));
    const [b] = await this.db.select().from(broadcasts).where(eq(broadcasts.id, r.broadcastId)).limit(1);
    if (b) await this.emitProgress(b, b.status);
  }
}
