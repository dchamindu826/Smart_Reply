/**
 * Shared conversation logic used by the API and the workers: who may see a chat, how rows
 * become API objects, owner changes with history, system notes and live events.
 */
import { Global, Injectable, Module } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, SQL, sql } from 'drizzle-orm';
import {
  Contact,
  Conversation,
  FileRef,
  Message,
  avatarColorFor,
  formatPhone,
  initialsOf,
  normalizePhone
} from '@smart-reply/shared';
import { AppError, notFound } from '../common/errors';
import type { Session } from '../common/session';
import type { Db, DbOrTx } from '../db/client';
import {
  contactLabels,
  contactOwnerHistory,
  contacts,
  conversationUserState,
  conversations,
  labels,
  messageAttachments,
  messages,
  users
} from '../db/schema';
import { InjectDb } from '../infra/db';
import { Realtime, rooms } from '../infra/realtime';
import { FilesService } from './files.service';

export type ContactRow = typeof contacts.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

export interface Viewer {
  companyId: string;
  userId: string;
  role: 'manager' | 'staff' | 'system_admin';
  seeAll: boolean;
}

export function viewerOf(s: Session): Viewer {
  return {
    companyId: s.companyId!,
    userId: s.userId,
    role: s.role,
    seeAll: s.role === 'manager' || s.permissions.seeAllChats
  };
}

/** Staff see customers they own plus the team pool (no owner), unless "see all chats" is on. */
export function contactVisibility(v: Viewer): SQL | undefined {
  if (v.seeAll) return undefined;
  return or(eq(contacts.ownerUserId, v.userId), isNull(contacts.ownerUserId));
}

export function previewOf(type: string, body: string, fileName?: string): string {
  if (type === 'text' || type === 'interactive' || type === 'template') return body.slice(0, 140);
  if (type === 'image') return body ? `🖼 ${body.slice(0, 120)}` : '🖼 Photo';
  if (type === 'audio') return '🎙 Voice message';
  if (type === 'video') return body ? `🎬 ${body.slice(0, 120)}` : '🎬 Video';
  if (type === 'document') return `📎 ${fileName ?? 'Document'}`;
  if (type === 'sticker') return 'Sticker';
  if (type === 'location') return '📍 Location';
  if (type === 'contacts') return '👤 Contact card';
  return body.slice(0, 140) || 'Message';
}

@Injectable()
export class InboxService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly realtime: Realtime,
    private readonly files: FilesService
  ) {}

  /* ───────── Presenters ───────── */

  async presentContacts(rows: ContactRow[], tx?: DbOrTx): Promise<Contact[]> {
    if (rows.length === 0) return [];
    const db = tx ?? this.db;
    const lbl = await db
      .select({ contactId: contactLabels.contactId, id: labels.id, name: labels.name, color: labels.color })
      .from(contactLabels)
      .innerJoin(labels, eq(labels.id, contactLabels.labelId))
      .where(inArray(contactLabels.contactId, rows.map(r => r.id)))
      .orderBy(asc(labels.name));
    const byContact = new Map<string, Contact['labels']>();
    for (const l of lbl) {
      const list = byContact.get(l.contactId) ?? [];
      list.push({ id: l.id, name: l.name, color: l.color as Contact['labels'][number]['color'] });
      byContact.set(l.contactId, list);
    }
    const now = Date.now();
    return rows.map(r => {
      const name = r.name || r.profileName || (r.waId ? formatPhone(r.waId) : r.username ?? 'WhatsApp user');
      const permExpired = r.callPermission === 'temporary' && r.callPermissionExpiresAt && r.callPermissionExpiresAt.getTime() < now;
      return {
        id: r.id,
        waId: r.waId,
        phone: r.waId ? formatPhone(r.waId) : '',
        username: r.username,
        name,
        initials: initialsOf(name),
        avatarColor: r.avatarColor,
        city: r.city,
        ownerUserId: r.ownerUserId,
        callPermission: {
          status: permExpired ? 'none' : r.callPermission,
          expiresAt: permExpired ? null : (r.callPermissionExpiresAt?.toISOString() ?? null)
        },
        marketingOptIn: r.marketingOptIn,
        blocked: r.blockedAt !== null,
        labels: byContact.get(r.id) ?? [],
        firstSeenAt: r.firstSeenAt.toISOString(),
        notes: r.notes
      };
    });
  }

  async presentConversations(rows: ConversationRow[], userId: string | null, tx?: DbOrTx): Promise<Conversation[]> {
    if (rows.length === 0) return [];
    const db = tx ?? this.db;
    const contactRows = await db.select().from(contacts).where(inArray(contacts.id, rows.map(r => r.contactId)));
    const presented = new Map((await this.presentContacts(contactRows, db)).map(c => [c.id, c]));
    const states = userId
      ? await db
          .select()
          .from(conversationUserState)
          .where(and(eq(conversationUserState.userId, userId), inArray(conversationUserState.conversationId, rows.map(r => r.id))))
      : [];
    const stateBy = new Map(states.map(s => [s.conversationId, s]));
    return rows
      .filter(r => presented.has(r.contactId))
      .map(r => ({
        id: r.id,
        contactId: r.contactId,
        contact: presented.get(r.contactId)!,
        status: r.status,
        lastPreview: r.lastPreview,
        lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
        windowExpiresAt: r.windowExpiresAt?.toISOString() ?? null,
        unreadCount: r.unreadCount,
        botActive: r.botActive,
        favorite: stateBy.get(r.id)?.favorite ?? false,
        archived: stateBy.get(r.id)?.archived ?? false
      }));
  }

  async presentMessages(rows: MessageRow[], tx?: DbOrTx): Promise<Message[]> {
    if (rows.length === 0) return [];
    const db = tx ?? this.db;
    const ids = rows.map(r => r.id);
    const att = await db
      .select()
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, ids))
      .orderBy(asc(messageAttachments.position));
    const refs = await this.files.refs(att.map(a => a.fileId), db);
    const byMsg = new Map<string, FileRef[]>();
    for (const a of att) {
      const ref = refs.get(a.fileId);
      if (!ref) continue;
      const list = byMsg.get(a.messageId) ?? [];
      list.push(ref);
      byMsg.set(a.messageId, list);
    }
    const senderIds = [...new Set(rows.map(r => r.senderUserId).filter((x): x is string => Boolean(x)))];
    const senders = senderIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, senderIds))
      : [];
    const nameBy = new Map(senders.map(s => [s.id, s.name]));
    return rows.map(r => ({
      id: r.id,
      conversationId: r.conversationId,
      direction: r.direction,
      type: r.type as Message['type'],
      body: r.body,
      sender: {
        kind: r.senderKind,
        userId: r.senderUserId,
        name: r.senderUserId ? (nameBy.get(r.senderUserId) ?? null) : r.senderKind === 'bot' ? 'AI bot' : null
      },
      templateName: r.templateName,
      buttons: r.buttons,
      attachments: byMsg.get(r.id) ?? [],
      status: r.status,
      error: r.error,
      replyToId: r.replyToId,
      createdAt: r.createdAt.toISOString()
    }));
  }

  /* ───────── Loading with visibility ───────── */

  /** A conversation the viewer may see, or NOT_FOUND. */
  async visibleConversation(v: Viewer, id: string, tx?: DbOrTx): Promise<{ conv: ConversationRow; contact: ContactRow }> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Chat');
    const db = tx ?? this.db;
    const [row] = await db
      .select({ conv: conversations, contact: contacts })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(and(eq(conversations.id, id), eq(conversations.companyId, v.companyId), contactVisibility(v)))
      .limit(1);
    if (!row) throw notFound('Chat');
    return row;
  }

  async visibleContact(v: Viewer, id: string, tx?: DbOrTx): Promise<ContactRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Customer');
    const [row] = await (tx ?? this.db)
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.companyId, v.companyId), contactVisibility(v)))
      .limit(1);
    if (!row) throw notFound('Customer');
    return row;
  }

  async conversationById(companyId: string, id: string, userId: string | null, tx?: DbOrTx): Promise<Conversation | null> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.companyId, companyId)))
      .limit(1);
    if (!row) return null;
    const [c] = await this.presentConversations([row], userId, tx);
    return c ?? null;
  }

  /* ───────── Creating ───────── */

  /** Find a contact by phone digits or BSUID, or create it. */
  async ensureContact(
    companyId: string,
    input: { waId?: string | null; bsuid?: string | null; profileName?: string; username?: string | null; name?: string },
    tx?: DbOrTx
  ): Promise<{ contact: ContactRow; created: boolean }> {
    const db = tx ?? this.db;
    const conds: SQL[] = [];
    if (input.bsuid) conds.push(eq(contacts.bsuid, input.bsuid));
    if (input.waId) conds.push(eq(contacts.waId, input.waId));
    if (conds.length === 0) throw new AppError('BAD_REQUEST', 'A phone number is needed.');
    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, companyId), or(...conds)))
      .limit(1);
    if (existing) {
      const patch: Partial<ContactRow> = {};
      if (input.bsuid && !existing.bsuid) patch.bsuid = input.bsuid;
      if (input.waId && !existing.waId) patch.waId = input.waId;
      if (input.profileName && input.profileName !== existing.profileName) patch.profileName = input.profileName;
      if (input.username && input.username !== existing.username) patch.username = input.username;
      if (Object.keys(patch).length) {
        const [u] = await db.update(contacts).set(patch).where(eq(contacts.id, existing.id)).returning();
        return { contact: u, created: false };
      }
      return { contact: existing, created: false };
    }
    const [created] = await db
      .insert(contacts)
      .values({
        companyId,
        waId: input.waId ?? null,
        bsuid: input.bsuid ?? null,
        username: input.username ?? null,
        name: input.name ?? '',
        profileName: input.profileName ?? '',
        avatarColor: avatarColorFor(input.waId ?? input.bsuid ?? String(Date.now()))
      })
      .onConflictDoNothing()
      .returning();
    if (created) return { contact: created, created: true };
    // Lost a race with another worker; read the winner.
    const [again] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, companyId), or(...conds)))
      .limit(1);
    if (!again) throw new Error('Contact upsert failed');
    return { contact: again, created: false };
  }

  async ensureConversation(companyId: string, contactId: string, tx?: DbOrTx): Promise<ConversationRow> {
    const db = tx ?? this.db;
    const [existing] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.contactId, contactId)))
      .limit(1);
    if (existing) return existing;
    await db.insert(conversations).values({ companyId, contactId }).onConflictDoNothing();
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.contactId, contactId)))
      .limit(1);
    return row!;
  }

  static normalize(phone: string, cc = '94'): string {
    return normalizePhone(phone, cc);
  }

  /** Internal note or system line in a chat. Never sent to WhatsApp. */
  async addInternal(
    companyId: string,
    conversationId: string,
    kind: 'note' | 'system',
    body: string,
    senderUserId: string | null,
    tx?: DbOrTx,
    /** A note the AI bot wrote: shown as "AI bot" instead of "Team". */
    byBot = false
  ): Promise<MessageRow> {
    const [row] = await (tx ?? this.db)
      .insert(messages)
      .values({
        companyId,
        conversationId,
        direction: kind,
        type: kind,
        body,
        senderUserId,
        senderKind: kind === 'note' && senderUserId ? 'user' : kind === 'note' && byBot ? 'bot' : 'system',
        status: 'sent'
      })
      .returning();
    return row;
  }

  /* ───────── Ownership ───────── */

  /**
   * Change the customer's owner. Writes history and a system line in the chat.
   * Returns false when nothing changed.
   */
  async setOwner(
    companyId: string,
    contact: ContactRow,
    toUserId: string | null,
    actor: { userId: string | null; name: string; kind: 'user' | 'auto_assign' | 'rule' | 'system' },
    reason: string,
    tx?: DbOrTx
  ): Promise<boolean> {
    if ((contact.ownerUserId ?? null) === (toUserId ?? null)) return false;
    const db = tx ?? this.db;
    let toName: string | null = null;
    if (toUserId) {
      const [u] = await db
        .select({ id: users.id, name: users.name, status: users.status })
        .from(users)
        .where(and(eq(users.id, toUserId), eq(users.companyId, companyId)))
        .limit(1);
      if (!u || u.status !== 'active') throw notFound('Staff member');
      toName = u.name;
    }
    let fromName: string | null = null;
    if (contact.ownerUserId) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, contact.ownerUserId)).limit(1);
      fromName = u?.name ?? null;
    }
    await db.update(contacts).set({ ownerUserId: toUserId }).where(eq(contacts.id, contact.id));
    await db.insert(contactOwnerHistory).values({
      companyId,
      contactId: contact.id,
      fromUserId: contact.ownerUserId,
      toUserId,
      actorUserId: actor.userId,
      actorKind: actor.kind,
      reason
    });
    const conv = await this.ensureConversation(companyId, contact.id, db);
    const who = contact.name || contact.profileName || (contact.waId ? formatPhone(contact.waId) : 'this customer');
    const line = toUserId
      ? fromName
        ? `Moved from ${fromName} to ${toName} by ${actor.name}${reason ? ` · ${reason}` : ''}. Chats and calls from ${who} now go to ${toName}.`
        : `Customer assigned to ${toName} by ${actor.name}${reason ? ` · ${reason}` : ''}. Chats and calls from ${who} now go to ${toName}.`
      : `Customer unassigned by ${actor.name}${fromName ? ` (was ${fromName})` : ''}. Back to the team queue.`;
    await this.addInternal(companyId, conv.id, 'system', line, null, db);
    contact.ownerUserId = toUserId;
    return true;
  }

  /* ───────── Live events ───────── */

  /** Rooms that may see a customer's chat: managers, the owner, the pool when unowned, "see all" staff. */
  roomsFor(companyId: string, ownerUserId: string | null): string[] {
    const list = [rooms.managers(companyId), `company:${companyId}:allchats`];
    if (ownerUserId) list.push(rooms.user(ownerUserId));
    else list.push(rooms.company(companyId));
    return list;
  }

  async emitConversation(companyId: string, conversationId: string, previousOwner?: string | null): Promise<void> {
    const conv = await this.conversationById(companyId, conversationId, null);
    if (!conv) return;
    const r = this.roomsFor(companyId, conv.contact.ownerUserId);
    if (previousOwner && previousOwner !== conv.contact.ownerUserId) r.push(rooms.user(previousOwner));
    this.realtime.emit(r, 'conversation.updated', { conversation: conv });
  }

  async emitMessage(companyId: string, messageId: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.companyId, companyId)))
      .limit(1);
    if (!row) return;
    const conv = await this.conversationById(companyId, row.conversationId, null);
    if (!conv) return;
    const [message] = await this.presentMessages([row]);
    this.realtime.emit(this.roomsFor(companyId, conv.contact.ownerUserId), 'message.created', { message, conversation: conv });
  }

  async emitContact(companyId: string, contactId: string): Promise<void> {
    const [row] = await this.db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId))).limit(1);
    if (!row) return;
    const [contact] = await this.presentContacts([row]);
    this.realtime.emit(this.roomsFor(companyId, row.ownerUserId), 'contact.updated', { contact });
  }

  /** Latest messages of a conversation, oldest first (for the AI bot and exports). */
  async recentMessages(conversationId: string, limit: number, tx?: DbOrTx): Promise<MessageRow[]> {
    const rows = await (tx ?? this.db)
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return rows.reverse();
  }

  /** Bump the conversation after any customer-visible message. */
  async touch(
    conversationId: string,
    patch: { preview: string; at: Date; inbound: boolean },
    tx?: DbOrTx
  ): Promise<void> {
    const db = tx ?? this.db;
    if (patch.inbound) {
      await db
        .update(conversations)
        .set({
          lastPreview: patch.preview,
          lastMessageAt: patch.at,
          lastInboundAt: patch.at,
          windowExpiresAt: new Date(patch.at.getTime() + 24 * 3600_000),
          unreadCount: sql`${conversations.unreadCount} + 1`,
          status: 'open',
          resolvedAt: null
        })
        .where(eq(conversations.id, conversationId));
    } else {
      await db
        .update(conversations)
        .set({ lastPreview: patch.preview, lastMessageAt: patch.at })
        .where(eq(conversations.id, conversationId));
    }
  }
}

@Global()
@Module({ providers: [InboxService], exports: [InboxService] })
export class InboxCoreModule {}
