/**
 * What happens after a customer message arrives (worker job `automation.inbound`):
 * 1. auto-assign a customer who has no owner,
 * 2. keyword rules (label, owner, quick reply),
 * 3. greeting and away messages (business profile and automated flows),
 * 4. the AI bot, when the company's paid add-on is active.
 */
import { Global, Injectable, Module } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import type { CallHours } from '@smart-reply/shared';
import type { Db } from '../db/client';
import {
  assignmentRules,
  businessProfiles,
  callSettings,
  contactLabels,
  contacts,
  conversations,
  flows,
  keywordRules,
  messages,
  presence,
  quickReplies,
  users
} from '../db/schema';
import { InjectDb } from '../infra/db';
import { logger } from '../infra/logger';
import { Queues } from '../infra/queues';
import { Realtime, rooms } from '../infra/realtime';
import { isOpen } from './hours';
import { ContactRow, ConversationRow, InboxService, MessageRow } from './inbox.service';
import { MessagingService } from './messaging.service';
import { PushService } from './push.service';

const AWAY_REPEAT_MS = 12 * 3600_000;

function matches(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some(k => k.trim() && t.includes(k.trim().toLowerCase()));
}

@Injectable()
export class AutomationService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly queues: Queues,
    private readonly realtime: Realtime,
    private readonly push: PushService
  ) {}

  async onInbound(messageId: string): Promise<void> {
    const [row] = await this.db
      .select({ m: messages, conv: conversations, contact: contacts })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!row || row.m.direction !== 'in') return;
    const { m, conv, contact } = row;
    const companyId = m.companyId;
    if (contact.blockedAt) return;

    const [rules] = await this.db.select().from(assignmentRules).where(eq(assignmentRules.companyId, companyId)).limit(1);
    const previousOwner = contact.ownerUserId;

    await this.applyKeywordRules(companyId, m, conv, contact);
    if (!contact.ownerUserId && rules && rules.autoAssign !== 'off') await this.autoAssign(companyId, contact, rules);
    if (contact.ownerUserId !== previousOwner) {
      await this.inbox.emitConversation(companyId, conv.id, previousOwner);
      if (contact.ownerUserId) {
        const c = await this.inbox.conversationById(companyId, conv.id, null);
        if (c) this.realtime.emit([rooms.user(contact.ownerUserId)], 'conversation.assigned', { conversation: c, byName: 'Auto-assign' });
        await this.push.notify([contact.ownerUserId], 'New chat assigned to you', contact.name || contact.profileName || 'New customer', {
          conversationId: conv.id,
          kind: 'assigned'
        });
      }
    }

    const sentAuto = await this.greetingAndAway(companyId, m, conv, contact);
    if (!sentAuto && conv.botActive) await this.queues.add('ai.reply', { messageId: m.id }, { jobId: `ai-${m.id}`, attempts: 2 });
  }

  private async applyKeywordRules(companyId: string, m: MessageRow, conv: ConversationRow, contact: ContactRow): Promise<void> {
    if (!m.body) return;
    const rules = await this.db.select().from(keywordRules).where(and(eq(keywordRules.companyId, companyId), eq(keywordRules.enabled, true)));
    for (const r of rules) {
      if (!matches(m.body, r.keywords)) continue;
      await this.db.update(keywordRules).set({ matchCount: sql`${keywordRules.matchCount} + 1` }).where(eq(keywordRules.id, r.id));
      if (r.labelId) {
        await this.db.insert(contactLabels).values({ companyId, contactId: contact.id, labelId: r.labelId }).onConflictDoNothing();
      }
      if (r.assignUserId && !contact.ownerUserId) {
        try {
          await this.inbox.setOwner(companyId, contact, r.assignUserId, { userId: null, name: 'Keyword rule', kind: 'rule' }, `“${r.keywords[0]}”`);
        } catch (err) {
          logger.warn({ err, rule: r.id }, 'Keyword rule owner not available');
        }
      }
      if (r.quickReplyId) await this.sendQuickReply(companyId, conv, contact, r.quickReplyId);
      await this.inbox.emitContact(companyId, contact.id);
    }
  }

  private async sendQuickReply(companyId: string, conv: ConversationRow, contact: ContactRow, quickReplyId: string): Promise<void> {
    const [qr] = await this.db.select().from(quickReplies).where(and(eq(quickReplies.id, quickReplyId), eq(quickReplies.companyId, companyId))).limit(1);
    if (!qr) return;
    const fresh = await this.freshConversation(conv.id);
    await this.messaging.sendFreeForm(companyId, fresh, contact, { text: qr.text, fileIds: qr.fileIds }, { userId: null, kind: 'system' });
    await this.db.update(quickReplies).set({ usedCount: sql`${quickReplies.usedCount} + 1` }).where(eq(quickReplies.id, qr.id));
  }

  private async freshConversation(id: string): Promise<ConversationRow> {
    const [c] = await this.db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return c!;
  }

  /** Pick an available staff member by round robin or by fewest open chats. */
  async autoAssign(companyId: string, contact: ContactRow, rules: typeof assignmentRules.$inferSelect): Promise<void> {
    const candidates = await this.db
      .select({ id: users.id, name: users.name, lastAssignedAt: users.lastAssignedAt, chatStatus: presence.status })
      .from(users)
      .leftJoin(presence, and(eq(presence.userId, users.id), eq(presence.channel, 'chat')))
      .where(and(eq(users.companyId, companyId), eq(users.role, 'staff'), eq(users.status, 'active')))
      .orderBy(asc(sql`coalesce(${users.lastAssignedAt}, 'epoch'::timestamptz)`), asc(users.id));
    let pool = candidates.filter(c => !rules.skipOnBreak || c.chatStatus === 'available' || c.chatStatus === null);
    if (pool.length === 0) return;
    const open = await this.db
      .select({ owner: contacts.ownerUserId, n: count() })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(and(eq(conversations.companyId, companyId), eq(conversations.status, 'open'), inArray(contacts.ownerUserId, pool.map(p => p.id))))
      .groupBy(contacts.ownerUserId);
    const openBy = new Map(open.map(o => [o.owner, Number(o.n)]));
    pool = pool.filter(p => (openBy.get(p.id) ?? 0) < rules.maxOpenChats);
    if (pool.length === 0) return;
    const pick =
      rules.autoAssign === 'least_open'
        ? [...pool].sort((a, b) => (openBy.get(a.id) ?? 0) - (openBy.get(b.id) ?? 0))[0]
        : pool[0];
    await this.inbox.setOwner(
      companyId,
      contact,
      pick.id,
      { userId: null, name: 'Auto-assign', kind: 'auto_assign' },
      rules.autoAssign === 'least_open' ? 'fewest open chats' : 'round robin'
    );
    await this.db.update(users).set({ lastAssignedAt: new Date() }).where(eq(users.id, pick.id));
  }

  /** Returns true when an automatic message was sent (the bot then waits for the next message). */
  private async greetingAndAway(companyId: string, m: MessageRow, conv: ConversationRow, contact: ContactRow): Promise<boolean> {
    const [profile] = await this.db.select().from(businessProfiles).where(eq(businessProfiles.companyId, companyId)).limit(1);
    const companyFlows = await this.db.select().from(flows).where(and(eq(flows.companyId, companyId), eq(flows.enabled, true)));
    const [cs] = await this.db.select({ hours: callSettings.hours }).from(callSettings).where(eq(callSettings.companyId, companyId)).limit(1);
    const hours: CallHours = cs?.hours ?? { enabled: false, timezone: 'Asia/Colombo', weekly: [], holidays: [] };
    const open = isOpen(hours);

    const [{ n: inboundCount }] = await this.db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), eq(messages.direction, 'in'), ne(messages.type, 'reaction')));
    const firstContact = Number(inboundCount) <= 1;

    const send = async (text: string, quickReplyId: string | null, tag: string) => {
      const fresh = await this.freshConversation(conv.id);
      if (quickReplyId) {
        await this.sendQuickReply(companyId, fresh, contact, quickReplyId);
      } else if (text.trim()) {
        const [row] = await this.messaging.sendFreeForm(companyId, fresh, contact, { text, fileIds: [] }, { userId: null, kind: 'system' });
        if (row) await this.db.update(messages).set({ raw: { auto: tag } }).where(eq(messages.id, row.id));
      }
    };

    // Keyword flows answer first.
    for (const f of companyFlows.filter(x => x.kind === 'keyword')) {
      if (m.body && matches(m.body, f.keywords) && (!f.onlyOutsideHours || !open)) {
        await send(f.replyText, f.quickReplyId, `flow:${f.id}`);
        await this.db.update(flows).set({ matchCount: sql`${flows.matchCount} + 1` }).where(eq(flows.id, f.id));
        return true;
      }
    }

    if (firstContact) {
      const g = companyFlows.find(x => x.kind === 'greeting' && (!x.onlyOutsideHours || !open));
      if (g) {
        await send(g.replyText, g.quickReplyId, `flow:${g.id}`);
        await this.db.update(flows).set({ matchCount: sql`${flows.matchCount} + 1` }).where(eq(flows.id, g.id));
        return true;
      }
      if (profile?.greetingOn && profile.greetingText.trim()) {
        await send(profile.greetingText, null, 'greeting');
        return true;
      }
    }

    if (!open) {
      const [recentAway] = await this.db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conv.id),
            eq(messages.senderKind, 'system'),
            eq(messages.direction, 'out'),
            gt(messages.createdAt, new Date(Date.now() - AWAY_REPEAT_MS)),
            sql`(${messages.raw}->>'auto' = 'away' or ${messages.raw}->>'auto' like 'flow:%')`
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);
      if (recentAway) return false;
      const a = companyFlows.find(x => x.kind === 'away');
      if (a) {
        await send(a.replyText, a.quickReplyId, 'away');
        await this.db.update(flows).set({ matchCount: sql`${flows.matchCount} + 1` }).where(eq(flows.id, a.id));
        return true;
      }
      if (profile?.awayOn && profile.awayText.trim()) {
        await send(profile.awayText, null, 'away');
        return true;
      }
    }
    return false;
  }
}

@Global()
@Module({ providers: [AutomationService], exports: [AutomationService] })
export class AutomationCoreModule {}
