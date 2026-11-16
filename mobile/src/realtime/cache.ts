/**
 * Pure functions that apply live events and optimistic sends to cached query data.
 * They never mutate their input, so React Query sees a new reference.
 */
import type { InfiniteData } from '@tanstack/react-query';
import type {
  Call,
  ChannelPresence,
  Contact,
  Conversation,
  ConversationFilter,
  Message,
  MessageStatus,
  Page,
  PresenceChannel,
  StaffMember
} from '@smart-reply/shared';
import { dayLabel, isSameDay } from '@/lib/time';

export type Pages<T> = InfiniteData<Page<T>, string | null>;

export const TEMP_PREFIX = 'tmp-';
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

function mapItems<T>(data: Pages<T>, fn: (items: T[], pageIndex: number) => T[]): Pages<T> {
  return { ...data, pages: data.pages.map((p, i) => ({ ...p, items: fn(p.items, i) })) };
}

function contains<T extends { id: string }>(data: Pages<T>, id: string): boolean {
  return data.pages.some(p => p.items.some(i => i.id === id));
}

/* ───────── Messages (newest first) ───────── */

export function upsertMessage(data: Pages<Message> | undefined, msg: Message): Pages<Message> | undefined {
  if (!data) return data;
  if (contains(data, msg.id)) return mapItems(data, items => items.map(m => (m.id === msg.id ? msg : m)));
  return mapItems(data, (items, i) => (i === 0 ? [msg, ...items] : items));
}

/** Swaps an optimistic bubble for the messages the API created. */
export function replaceTemp(data: Pages<Message> | undefined, tempId: string, created: Message[]): Pages<Message> | undefined {
  if (!data) return data;
  const fresh = created.filter(m => !contains(data, m.id));
  let placed = false;
  const next = mapItems(data, items =>
    items.flatMap(m => {
      if (m.id !== tempId) return [m];
      placed = true;
      // `created` is oldest first; the cache is newest first.
      return [...fresh].reverse();
    })
  );
  if (placed) return next;
  return fresh.reduce<Pages<Message> | undefined>((acc, m) => upsertMessage(acc, m), next);
}

export function failTemp(data: Pages<Message> | undefined, tempId: string, error: string): Pages<Message> | undefined {
  if (!data) return data;
  return mapItems(data, items => items.map(m => (m.id === tempId ? { ...m, status: 'failed' as const, error } : m)));
}

export function removeMessage(data: Pages<Message> | undefined, id: string): Pages<Message> | undefined {
  if (!data) return data;
  return mapItems(data, items => items.filter(m => m.id !== id));
}

const STATUS_RANK: Record<MessageStatus, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Status events can arrive out of order; never move a tick backwards (except to failed). */
export function applyStatus(
  data: Pages<Message> | undefined,
  messageId: string,
  status: MessageStatus,
  error: string | null
): Pages<Message> | undefined {
  if (!data) return data;
  return mapItems(data, items =>
    items.map(m => {
      if (m.id !== messageId) return m;
      if (status !== 'failed' && STATUS_RANK[status] < STATUS_RANK[m.status]) return m;
      return { ...m, status, error };
    })
  );
}

export function allMessages(data: Pages<Message> | undefined): Message[] {
  return data ? data.pages.flatMap(p => p.items) : [];
}

export type ThreadRow = { kind: 'message'; key: string; message: Message } | { kind: 'day'; key: string; label: string };

/**
 * Rows for an inverted list (newest first). A day label goes after the oldest message of
 * each day, so it shows above that day's messages on screen.
 */
export function withDaySeparators(messages: Message[], now: Date = new Date()): ThreadRow[] {
  const rows: ThreadRow[] = [];
  messages.forEach((m, i) => {
    rows.push({ kind: 'message', key: m.id, message: m });
    const older = messages[i + 1];
    if (!older || !isSameDay(older.createdAt, m.createdAt)) {
      rows.push({ kind: 'day', key: `day-${m.createdAt.slice(0, 10)}-${m.id}`, label: dayLabel(m.createdAt, now) });
    }
  });
  return rows;
}

/* ───────── Conversations ───────── */

/** Whether a conversation that is not in a cached list yet belongs at its top. */
export function belongsInList(conv: Conversation, filter: ConversationFilter, myUserId: string | null): boolean {
  switch (filter) {
    case 'all':
      return !conv.archived && conv.status === 'open';
    case 'unread':
      return !conv.archived && conv.unreadCount > 0;
    case 'mine':
      return !conv.archived && conv.status === 'open' && myUserId !== null && conv.contact.ownerUserId === myUserId;
    case 'pool':
    case 'no_owner':
      return !conv.archived && conv.status === 'open' && conv.contact.ownerUserId === null;
    case 'favorites':
      return conv.favorite;
    case 'archived':
      return conv.archived;
    case 'resolved':
      return conv.status === 'resolved';
    default:
      return false;
  }
}

function newer(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

/**
 * Updates a conversation in a cached list: replaced in place, moved to the top when it has a
 * newer message, inserted when it now belongs, removed when it no longer does.
 */
export function upsertConversation(
  data: Pages<Conversation> | undefined,
  conv: Conversation,
  filter: ConversationFilter,
  myUserId: string | null
): Pages<Conversation> | undefined {
  if (!data) return data;
  const belongs = belongsInList(conv, filter, myUserId);
  let old: Conversation | undefined;
  for (const p of data.pages) old = old ?? p.items.find(c => c.id === conv.id);

  if (!old) {
    if (!belongs) return data;
    return mapItems(data, (items, i) => (i === 0 ? [conv, ...items] : items));
  }
  // Filters with server-only rules (expiring, labeled) keep what the server gave.
  const removable = filter !== 'expiring' && filter !== 'labeled';
  if (removable && !belongs) return mapItems(data, items => items.filter(c => c.id !== conv.id));
  if (newer(conv.lastMessageAt, old.lastMessageAt)) {
    const without = mapItems(data, items => items.filter(c => c.id !== conv.id));
    return mapItems(without, (items, i) => (i === 0 ? [conv, ...items] : items));
  }
  return mapItems(data, items => items.map(c => (c.id === conv.id ? conv : c)));
}

export function patchConversation(
  data: Pages<Conversation> | undefined,
  id: string,
  patch: Partial<Conversation>
): Pages<Conversation> | undefined {
  if (!data) return data;
  return mapItems(data, items => items.map(c => (c.id === id ? { ...c, ...patch } : c)));
}

export function updateContactInConversations(data: Pages<Conversation> | undefined, contact: Contact): Pages<Conversation> | undefined {
  if (!data) return data;
  return mapItems(data, items => items.map(c => (c.contactId === contact.id ? { ...c, contact } : c)));
}

export function updateContactInList(data: Pages<Contact> | undefined, contact: Contact): Pages<Contact> | undefined {
  if (!data) return data;
  return mapItems(data, items => items.map(c => (c.id === contact.id ? contact : c)));
}

/* ───────── Calls and presence ───────── */

export function upsertCall(data: Pages<Call> | undefined, call: Call): Pages<Call> | undefined {
  if (!data) return data;
  if (contains(data, call.id)) return mapItems(data, items => items.map(c => (c.id === call.id ? call : c)));
  return mapItems(data, (items, i) => (i === 0 ? [call, ...items] : items));
}

export function applyPresence(
  staff: StaffMember[] | undefined,
  userId: string,
  channel: PresenceChannel,
  presence: ChannelPresence
): StaffMember[] | undefined {
  if (!staff) return staff;
  return staff.map(s => (s.id === userId ? { ...s, presence: { ...s.presence, [channel]: presence } } : s));
}
