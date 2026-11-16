import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, gt, ilike, inArray, isNull, lt, lte, or, SQL, sql } from 'drizzle-orm';
import {
  Conversation,
  ConversationCounts,
  ConversationListQuery,
  Message,
  Page,
  SendMessageInput,
  formatMoney
} from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError, notFound } from '../../common/errors';
import { CompanySession, can } from '../../common/session';
import { InboxService, contactVisibility, viewerOf } from '../../core/inbox.service';
import { MessagingService } from '../../core/messaging.service';
import type { Db } from '../../db/client';
import {
  contactLabels,
  companies,
  contacts,
  conversationUserState,
  conversations,
  files,
  messageAttachments,
  messages,
  products,
  quickReplies,
  users
} from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { WhatsappAccounts } from '../../meta/platform';

const CLOSING_SOON_MS = 2 * 3600_000;

function encodeCursor(at: Date | null, id: string): string {
  return Buffer.from(`${at ? at.toISOString() : ''}|${id}`).toString('base64url');
}
function decodeCursor(c: string | undefined): { at: Date | null; id: string } | null {
  if (!c) return null;
  try {
    const [a, id] = Buffer.from(c, 'base64url').toString().split('|');
    if (!id) return null;
    return { at: a ? new Date(a) : null, id };
  } catch {
    return null;
  }
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly whatsapp: WhatsappAccounts,
    private readonly audit: Audit
  ) {}

  private userState(s: CompanySession) {
    return and(eq(conversationUserState.conversationId, conversations.id), eq(conversationUserState.userId, s.userId));
  }

  private filterCondition(s: CompanySession, filter: ConversationListQuery['filter']): SQL | undefined {
    const now = new Date();
    const archivedByMe = exists(
      this.db.select({ x: sql`1` }).from(conversationUserState).where(and(this.userState(s), eq(conversationUserState.archived, true)))
    );
    const favoriteByMe = exists(
      this.db.select({ x: sql`1` }).from(conversationUserState).where(and(this.userState(s), eq(conversationUserState.favorite, true)))
    );
    switch (filter) {
      case 'unread':
        return and(gt(conversations.unreadCount, 0), sql`not ${archivedByMe}`);
      case 'expiring':
        return and(gt(conversations.windowExpiresAt, now), lte(conversations.windowExpiresAt, new Date(now.getTime() + CLOSING_SOON_MS)));
      case 'labeled':
        return exists(this.db.select({ x: sql`1` }).from(contactLabels).where(eq(contactLabels.contactId, conversations.contactId)));
      case 'no_owner':
      case 'pool':
        return and(isNull(contacts.ownerUserId), eq(conversations.status, 'open'));
      case 'mine':
        return eq(contacts.ownerUserId, s.userId);
      case 'favorites':
        return favoriteByMe;
      case 'archived':
        return archivedByMe;
      case 'resolved':
        return eq(conversations.status, 'resolved');
      case 'all':
      default:
        return sql`not ${archivedByMe}`;
    }
  }

  async list(s: CompanySession, q: ConversationListQuery): Promise<Page<Conversation>> {
    const v = viewerOf(s);
    const conds: (SQL | undefined)[] = [
      eq(conversations.companyId, s.companyId),
      contactVisibility(v),
      this.filterCondition(s, q.filter),
      // Hide conversations that have never had a message (created by a contact import).
      sql`${conversations.lastMessageAt} is not null`
    ];
    if (q.owner === 'none') conds.push(isNull(contacts.ownerUserId));
    else if (q.owner === 'me') conds.push(eq(contacts.ownerUserId, s.userId));
    else if (q.owner) conds.push(eq(contacts.ownerUserId, q.owner));
    if (q.label) {
      conds.push(
        exists(this.db.select({ x: sql`1` }).from(contactLabels).where(and(eq(contactLabels.contactId, conversations.contactId), eq(contactLabels.labelId, q.label!))))
      );
    }
    if (q.search) {
      const term = `%${q.search.replace(/[%_]/g, '')}%`;
      const digits = q.search.replace(/\D/g, '');
      conds.push(
        or(
          ilike(contacts.name, term),
          ilike(contacts.profileName, term),
          ilike(conversations.lastPreview, term),
          ...(digits.length >= 3 ? [ilike(contacts.waId, `%${digits}%`)] : [])
        )
      );
    }
    const cur = decodeCursor(q.cursor);
    if (cur?.at) {
      conds.push(or(lt(conversations.lastMessageAt, cur.at), and(eq(conversations.lastMessageAt, cur.at), lt(conversations.id, cur.id))));
    }
    const rows = await this.db
      .select({ conv: conversations })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(and(...conds))
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit).map(r => r.conv);
    const items = await this.inbox.presentConversations(page, s.userId);
    const last = page[page.length - 1];
    return { items, nextCursor: rows.length > q.limit && last ? encodeCursor(last.lastMessageAt, last.id) : null };
  }

  async counts(s: CompanySession): Promise<ConversationCounts> {
    const v = viewerOf(s);
    const now = new Date();
    const soon = new Date(now.getTime() + CLOSING_SOON_MS);
    const st = this.db
      .select()
      .from(conversationUserState)
      .where(eq(conversationUserState.userId, s.userId))
      .as('st');
    const [r] = await this.db
      .select({
        all: sql<number>`count(*) filter (where coalesce(${st.archived}, false) = false)`,
        unread: sql<number>`count(*) filter (where ${conversations.unreadCount} > 0 and coalesce(${st.archived}, false) = false)`,
        expiring: sql<number>`count(*) filter (where ${conversations.windowExpiresAt} > ${now} and ${conversations.windowExpiresAt} <= ${soon})`,
        labeled: sql<number>`count(*) filter (where exists (select 1 from ${contactLabels} where ${contactLabels.contactId} = ${conversations.contactId}))`,
        noOwner: sql<number>`count(*) filter (where ${contacts.ownerUserId} is null and ${conversations.status} = 'open')`,
        mine: sql<number>`count(*) filter (where ${contacts.ownerUserId} = ${s.userId})`,
        favorites: sql<number>`count(*) filter (where ${st.favorite} = true)`,
        archived: sql<number>`count(*) filter (where ${st.archived} = true)`,
        resolved: sql<number>`count(*) filter (where ${conversations.status} = 'resolved')`
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .leftJoin(st, eq(st.conversationId, conversations.id))
      .where(and(eq(conversations.companyId, s.companyId), contactVisibility(v), sql`${conversations.lastMessageAt} is not null`));
    const n = (x: unknown) => Number(x ?? 0);
    return {
      all: n(r?.all),
      unread: n(r?.unread),
      expiring: n(r?.expiring),
      labeled: n(r?.labeled),
      no_owner: n(r?.noOwner),
      pool: n(r?.noOwner),
      mine: n(r?.mine),
      favorites: n(r?.favorites),
      archived: n(r?.archived),
      resolved: n(r?.resolved),
      closingSoon: n(r?.expiring)
    };
  }

  async get(s: CompanySession, id: string): Promise<Conversation> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    const [c] = await this.inbox.presentConversations([conv], s.userId);
    return c;
  }

  async messages(s: CompanySession, id: string, cursor: string | undefined, limit: number): Promise<Page<Message>> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    const cur = decodeCursor(cursor);
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conv.id),
          cur?.at ? or(lt(messages.createdAt, cur.at), and(eq(messages.createdAt, cur.at), lt(messages.id, cur.id))) : undefined
        )
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.inbox.presentMessages(page),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null
    };
  }

  /** Staff replying to a pool customer take ownership of them. */
  private async claimIfPool(s: CompanySession, contact: typeof contacts.$inferSelect): Promise<void> {
    if (s.role !== 'staff' || contact.ownerUserId) return;
    await this.inbox.setOwner(s.companyId, contact, s.userId, { userId: s.userId, name: s.name, kind: 'user' }, 'Replied from the team queue');
    await this.inbox.emitContact(s.companyId, contact.id);
  }

  private assertCanReply(s: CompanySession, contact: typeof contacts.$inferSelect): void {
    if (s.role === 'manager') return;
    if (!can(s, 'replyAssigned')) throw new AppError('FORBIDDEN', 'Your manager has turned off replying for you.');
    if (contact.ownerUserId && contact.ownerUserId !== s.userId && !s.permissions.seeAllChats) throw notFound('Chat');
  }

  async send(s: CompanySession, id: string, input: SendMessageInput): Promise<Message[]> {
    const { conv, contact } = await this.inbox.visibleConversation(viewerOf(s), id);
    this.assertCanReply(s, contact);
    const signature = await this.signatureOf(s);
    const text = input.text && signature ? `${input.text}\n\n${signature}` : input.text;
    const rows = await this.messaging.sendFreeForm(s.companyId, conv, contact, { ...input, text }, { userId: s.userId, kind: 'user' });
    await this.claimIfPool(s, contact);
    return this.inbox.presentMessages(rows);
  }

  private async signatureOf(s: CompanySession): Promise<string> {
    const [u] = await this.db.select({ signature: users.signature }).from(users).where(eq(users.id, s.userId)).limit(1);
    return u?.signature?.trim() ? `— ${u.signature.trim()}` : '';
  }

  async note(s: CompanySession, id: string, text: string, fileIds: string[]): Promise<Message> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    const row = await this.inbox.addInternal(s.companyId, conv.id, 'note', text, s.userId);
    if (fileIds.length) {
      const filesRows = await this.db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.companyId, s.companyId), inArray(files.id, fileIds), eq(files.uploaded, true)));
      if (filesRows.length) {
        await this.db.insert(messageAttachments).values(filesRows.map((f, i) => ({ messageId: row.id, fileId: f.id, companyId: s.companyId, position: i })));
      }
    }
    await this.inbox.emitMessage(s.companyId, row.id);
    const [m] = await this.inbox.presentMessages([row]);
    return m;
  }

  async sendTemplate(s: CompanySession, id: string, templateId: string, variables: string[]): Promise<Message> {
    if (!can(s, 'sendTemplates')) throw new AppError('FORBIDDEN', 'Your manager has turned off templates for you.');
    const { conv, contact } = await this.inbox.visibleConversation(viewerOf(s), id);
    this.assertCanReply(s, contact);
    await this.whatsapp.require(s.companyId);
    const row = await this.messaging.sendTemplate(s.companyId, conv, contact, { templateId, variables }, { userId: s.userId, kind: 'user' });
    await this.claimIfPool(s, contact);
    const [m] = await this.inbox.presentMessages([row]);
    return m;
  }

  async sendProduct(s: CompanySession, id: string, productId: string): Promise<Message[]> {
    const [p] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.companyId, s.companyId)))
      .limit(1);
    if (!p) throw notFound('Product');
    const price = formatMoney(p.priceMinor, p.currency) + (p.priceUnit ? ` ${p.priceUnit}` : '');
    const old = p.oldPriceMinor ? ` (was ${formatMoney(p.oldPriceMinor, p.currency)})` : '';
    const text = `*${p.name}*\n${price}${old}${p.note ? `\n${p.note}` : ''}${p.sku ? `\nSKU: ${p.sku}` : ''}`;
    return this.send(s, id, { text, fileIds: p.imageFileId ? [p.imageFileId] : [], voice: false });
  }

  async sendQuickReply(s: CompanySession, id: string, quickReplyId: string): Promise<Message[]> {
    const [qr] = await this.db
      .select()
      .from(quickReplies)
      .where(and(eq(quickReplies.id, quickReplyId), eq(quickReplies.companyId, s.companyId)))
      .limit(1);
    if (!qr || (qr.scope === 'only_me' && qr.ownerUserId !== s.userId)) throw notFound('Quick reply');
    const out = await this.send(s, id, { text: qr.text, fileIds: qr.fileIds, voice: false });
    await this.db.update(quickReplies).set({ usedCount: sql`${quickReplies.usedCount} + 1` }).where(eq(quickReplies.id, qr.id));
    return out;
  }

  async markRead(s: CompanySession, id: string): Promise<void> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    await this.db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conv.id));
    await this.db
      .insert(conversationUserState)
      .values({ conversationId: conv.id, userId: s.userId, companyId: s.companyId, lastReadAt: new Date() })
      .onConflictDoUpdate({ target: [conversationUserState.conversationId, conversationUserState.userId], set: { lastReadAt: new Date() } });
    if (conv.unreadCount > 0) {
      const [lastIn] = await this.db
        .select({ wa: messages.waMessageId })
        .from(messages)
        .where(and(eq(messages.conversationId, conv.id), eq(messages.direction, 'in')))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      if (lastIn?.wa) {
        const wa = await this.whatsapp.find(s.companyId);
        wa?.graph.markRead(wa.phoneNumberId, lastIn.wa).catch(err => logger.debug({ err }, 'Read receipt failed'));
      }
      await this.inbox.emitConversation(s.companyId, conv.id);
    }
  }

  async setStatus(s: CompanySession, id: string, status: 'open' | 'resolved'): Promise<Conversation> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    if (conv.status !== status) {
      await this.db
        .update(conversations)
        .set(status === 'resolved' ? { status, resolvedAt: new Date(), resolvedBy: s.userId, unreadCount: 0 } : { status, resolvedAt: null })
        .where(eq(conversations.id, conv.id));
      await this.inbox.addInternal(s.companyId, conv.id, 'system', status === 'resolved' ? `Marked resolved by ${s.name}` : `Reopened by ${s.name}`, null);
      await this.inbox.emitConversation(s.companyId, conv.id);
    }
    return this.get(s, id);
  }

  async setState(s: CompanySession, id: string, patch: { favorite?: boolean; archived?: boolean }): Promise<Conversation> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    await this.db
      .insert(conversationUserState)
      .values({ conversationId: conv.id, userId: s.userId, companyId: s.companyId, favorite: patch.favorite ?? false, archived: patch.archived ?? false })
      .onConflictDoUpdate({
        target: [conversationUserState.conversationId, conversationUserState.userId],
        set: { ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}), ...(patch.archived !== undefined ? { archived: patch.archived } : {}) }
      });
    return this.get(s, id);
  }

  /** Take over from the AI bot, or hand the chat back to it. Day-to-day work, not bot configuration. */
  async setBot(s: CompanySession, id: string, active: boolean): Promise<Conversation> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    if (conv.botActive !== active) {
      await this.db.update(conversations).set({ botActive: active }).where(eq(conversations.id, conv.id));
      await this.inbox.addInternal(s.companyId, conv.id, 'system', active ? `${s.name} handed the chat back to the AI bot` : `${s.name} took over from the AI bot`, null);
      await this.inbox.emitConversation(s.companyId, conv.id);
    }
    return this.get(s, id);
  }

  /** Start (or restart) a chat by sending a template to a contact or a new number. */
  async start(
    s: CompanySession,
    input: { contactId?: string; phone?: string; name?: string; templateId: string; variables: string[] }
  ): Promise<Conversation> {
    if (!can(s, 'sendTemplates')) throw new AppError('FORBIDDEN', 'Your manager has turned off templates for you.');
    const v = viewerOf(s);
    let contact;
    if (input.contactId) contact = await this.inbox.visibleContact(v, input.contactId);
    else if (input.phone) {
      const [company] = await this.db.select().from(companies).where(eq(companies.id, s.companyId)).limit(1);
      const waId = InboxService.normalize(input.phone, company?.defaultCountryCode ?? '94');
      const res = await this.inbox.ensureContact(s.companyId, { waId, name: input.name });
      contact = res.contact;
      if (res.created && s.role === 'staff') {
        await this.inbox.setOwner(s.companyId, contact, s.userId, { userId: s.userId, name: s.name, kind: 'user' }, 'Started the chat');
      }
    } else throw new AppError('VALIDATION_FAILED', 'Pick a customer or enter a phone number.');
    await this.whatsapp.require(s.companyId);
    const conv = await this.inbox.ensureConversation(s.companyId, contact.id);
    await this.messaging.sendTemplate(s.companyId, conv, contact, { templateId: input.templateId, variables: input.variables }, { userId: s.userId, kind: 'user' });
    return this.get(s, conv.id);
  }

  async ensureForContact(s: CompanySession, contactId: string): Promise<Conversation> {
    const contact = await this.inbox.visibleContact(viewerOf(s), contactId);
    const conv = await this.inbox.ensureConversation(s.companyId, contact.id);
    const [c] = await this.inbox.presentConversations([conv], s.userId);
    return c;
  }

  /** Messages with attachments for the contact info panel ("media, links and docs"). */
  async media(s: CompanySession, id: string): Promise<Message[]> {
    const { conv } = await this.inbox.visibleConversation(viewerOf(s), id);
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), inArray(messages.type, ['image', 'video', 'document', 'audio'])))
      .orderBy(asc(messages.createdAt))
      .limit(200);
    void this.audit;
    return this.inbox.presentMessages(rows);
  }
}
