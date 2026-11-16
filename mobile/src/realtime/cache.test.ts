import type { Contact, Conversation, Message, StaffMember } from '@smart-reply/shared';
import {
  applyPresence,
  applyStatus,
  belongsInList,
  failTemp,
  replaceTemp,
  upsertConversation,
  upsertMessage,
  withDaySeparators,
  type Pages
} from './cache';

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: 'ct1',
  waId: '94771234567',
  phone: '+94 77 123 4567',
  username: null,
  name: 'Nimal',
  initials: 'NI',
  avatarColor: 'a1',
  city: '',
  ownerUserId: null,
  callPermission: { status: 'none', expiresAt: null },
  marketingOptIn: false,
  blocked: false,
  labels: [],
  firstSeenAt: '2026-11-01T00:00:00Z',
  notes: '',
  ...over
});

const conv = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  id,
  contactId: 'ct1',
  contact: contact(),
  status: 'open',
  lastPreview: 'hi',
  lastMessageAt: '2026-11-16T10:00:00Z',
  windowExpiresAt: null,
  unreadCount: 0,
  botActive: false,
  favorite: false,
  archived: false,
  ...over
});

const msg = (id: string, over: Partial<Message> = {}): Message => ({
  id,
  conversationId: 'c1',
  direction: 'out',
  type: 'text',
  body: id,
  sender: { kind: 'user', userId: 'u1', name: 'Me' },
  templateName: null,
  buttons: [],
  attachments: [],
  status: 'sent',
  error: null,
  replyToId: null,
  createdAt: '2026-11-16T10:00:00Z',
  ...over
});

const pages = <T,>(...lists: T[][]): Pages<T> => ({
  pages: lists.map((items, i) => ({ items, nextCursor: i < lists.length - 1 ? `p${i + 1}` : null })),
  pageParams: lists.map((_, i) => (i === 0 ? null : `p${i}`))
});

describe('messages', () => {
  it('prepends a new message to the newest page and replaces a known one', () => {
    const d = pages([msg('m2'), msg('m1')], [msg('m0')]);
    const added = upsertMessage(d, msg('m3'));
    expect(added?.pages[0]?.items.map(m => m.id)).toEqual(['m3', 'm2', 'm1']);
    const replaced = upsertMessage(added, msg('m1', { body: 'edited' }));
    expect(replaced?.pages[0]?.items[2]?.body).toBe('edited');
    expect(d.pages[0]?.items).toHaveLength(2);
  });

  it('swaps the optimistic bubble for the server message', () => {
    const d = pages([msg('tmp-1', { status: 'queued' }), msg('m1')]);
    const next = replaceTemp(d, 'tmp-1', [msg('m2')]);
    expect(next?.pages[0]?.items.map(m => m.id)).toEqual(['m2', 'm1']);
  });

  it('does not duplicate when the socket delivered the message first', () => {
    const d = pages([msg('m2'), msg('tmp-1', { status: 'queued' }), msg('m1')]);
    const next = replaceTemp(d, 'tmp-1', [msg('m2')]);
    expect(next?.pages[0]?.items.map(m => m.id)).toEqual(['m2', 'm1']);
  });

  it('marks a failed send', () => {
    const next = failTemp(pages([msg('tmp-1', { status: 'queued' })]), 'tmp-1', 'Window closed');
    expect(next?.pages[0]?.items[0]).toMatchObject({ status: 'failed', error: 'Window closed' });
  });

  it('never moves ticks backwards, but always accepts failed', () => {
    const d = pages([msg('m1', { status: 'read' })]);
    expect(applyStatus(d, 'm1', 'delivered', null)?.pages[0]?.items[0]?.status).toBe('read');
    expect(applyStatus(d, 'm1', 'failed', 'boom')?.pages[0]?.items[0]).toMatchObject({ status: 'failed', error: 'boom' });
    expect(applyStatus(pages([msg('m1', { status: 'sent' })]), 'm1', 'read', null)?.pages[0]?.items[0]?.status).toBe('read');
  });

  it('leaves an empty cache alone', () => {
    expect(upsertMessage(undefined, msg('m1'))).toBeUndefined();
  });
});

describe('day separators', () => {
  it('puts a label after the oldest message of each day (inverted list)', () => {
    const now = new Date('2026-11-16T12:00:00');
    const rows = withDaySeparators(
      [
        msg('b2', { createdAt: new Date('2026-11-16T11:00:00').toISOString() }),
        msg('b1', { createdAt: new Date('2026-11-16T09:00:00').toISOString() }),
        msg('a1', { createdAt: new Date('2026-11-15T09:00:00').toISOString() })
      ],
      now
    );
    expect(rows.map(r => (r.kind === 'day' ? r.label : r.message.id))).toEqual(['b2', 'b1', 'Today', 'a1', 'Yesterday']);
  });
});

describe('conversations', () => {
  it('moves a conversation with a newer message to the top', () => {
    const d = pages([conv('c1'), conv('c2', { lastMessageAt: '2026-11-16T09:00:00Z' })]);
    const next = upsertConversation(d, conv('c2', { lastMessageAt: '2026-11-16T11:00:00Z', unreadCount: 1 }), 'all', null);
    expect(next?.pages[0]?.items.map(c => c.id)).toEqual(['c2', 'c1']);
  });

  it('inserts a new conversation only where it belongs', () => {
    const d = pages([conv('c1')]);
    expect(upsertConversation(d, conv('c9', { unreadCount: 2 }), 'unread', null)?.pages[0]?.items.map(c => c.id)).toEqual(['c9', 'c1']);
    expect(upsertConversation(d, conv('c9'), 'archived', null)?.pages[0]?.items.map(c => c.id)).toEqual(['c1']);
  });

  it('removes a conversation that left the filter', () => {
    const d = pages([conv('c1', { unreadCount: 3 })]);
    expect(upsertConversation(d, conv('c1', { unreadCount: 0 }), 'unread', null)?.pages[0]?.items).toEqual([]);
  });

  it('knows mine and the team queue', () => {
    const mine = conv('c1', { contact: contact({ ownerUserId: 'u1' }) });
    expect(belongsInList(mine, 'mine', 'u1')).toBe(true);
    expect(belongsInList(mine, 'pool', 'u1')).toBe(false);
    expect(belongsInList(conv('c2'), 'pool', 'u1')).toBe(true);
  });
});

describe('presence', () => {
  it('updates one channel of one staff member', () => {
    const base = { status: 'available' as const, reason: '', since: '2026-11-16T08:00:00Z', plannedMinutes: 0 };
    const staff = [{ id: 'u1', presence: { call: base, chat: base } }, { id: 'u2', presence: { call: base, chat: base } }] as unknown as StaffMember[];
    const brk = { status: 'brk' as const, reason: 'Lunch', since: '2026-11-16T12:00:00Z', plannedMinutes: 30 };
    const next = applyPresence(staff, 'u1', 'call', brk);
    expect(next?.[0]?.presence.call).toEqual(brk);
    expect(next?.[0]?.presence.chat).toEqual(base);
    expect(next?.[1]).toBe(staff[1]);
  });
});
