import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeApp, createCompany, db, getApp, getWorker, signIn, TestCompany } from './helpers';
import { WebhookProcessor } from '../src/worker/webhook.processor';
import { MessagingService } from '../src/core/messaging.service';
import { WebhooksService } from '../src/modules/webhooks/webhooks.service';
import { contacts, messages, whatsappAccounts } from '../src/db/schema';

/** Stub Meta: record Graph calls, answer like the Cloud API. */
export function stubMeta(): { calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://meta.test')) return real(input, init);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url.endsWith('/messages')) {
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.${calls.length}` }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  return { calls };
}

async function phoneNumberIdOf(companyId: string): Promise<string> {
  const [a] = await db().select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId));
  return a.phoneNumberId;
}

async function deliverInbound(companyId: string, from: string, text: string, id: string): Promise<void> {
  const app = await getApp();
  const value = {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '94770000000', phone_number_id: await phoneNumberIdOf(companyId) },
    contacts: [{ profile: { name: 'Kasun Perera' }, wa_id: from, user_id: `LK.${from}` }],
    messages: [{ from, from_user_id: `LK.${from}`, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }]
  };
  await app.get(WebhooksService).store({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value }] }] });
  const [ev] = await db().query.webhookEvents.findMany({ orderBy: (w, { desc }) => desc(w.receivedAt), limit: 1 });
  await (await getWorker()).get(WebhookProcessor).process(ev.id);
}

describe('conversations', () => {
  let a: TestCompany;
  let b: TestCompany;
  let meta: ReturnType<typeof stubMeta>;

  beforeAll(async () => {
    await getApp();
    a = await createCompany({ staffCount: 2, whatsapp: true });
    b = await createCompany({ staffCount: 1, whatsapp: true });
  });
  beforeEach(() => {
    meta = stubMeta();
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeApp();
  });

  it('stores an inbound message once even if Meta sends it twice', async () => {
    await deliverInbound(a.id, '94771234567', 'Hello, price list please', 'wamid.in1');
    await deliverInbound(a.id, '94771234567', 'Hello, price list please', 'wamid.in1');
    const rows = await db().select().from(messages).where(eq(messages.waMessageId, 'wamid.in1'));
    expect(rows).toHaveLength(1);
    const mgr = await signIn(a.manager);
    const list = await mgr.get('/api/v1/conversations');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].unreadCount).toBe(1);
    expect(list.body.items[0].contact.phone).toBe('+94 77 123 4567');
    expect(list.body.items[0].windowExpiresAt).toBeTruthy();
  });

  it('answers 404 to another company', async () => {
    const mgrA = await signIn(a.manager);
    const convId = (await mgrA.get('/api/v1/conversations')).body.items[0].id as string;
    const mgrB = await signIn(b.manager);
    expect((await mgrB.get(`/api/v1/conversations/${convId}`)).status).toBe(404);
    expect((await mgrB.get(`/api/v1/conversations/${convId}/messages`)).status).toBe(404);
    expect((await mgrB.post(`/api/v1/conversations/${convId}/messages`, { text: 'hi' })).status).toBe(404);
  });

  it('sends a reply through Meta and moves the status forward only', async () => {
    const mgr = await signIn(a.manager);
    const convId = (await mgr.get('/api/v1/conversations')).body.items[0].id as string;
    const sent = await mgr.post(`/api/v1/conversations/${convId}/messages`, { text: 'Here you go' });
    expect(sent.status).toBe(201);
    expect(sent.body[0].status).toBe('queued');
    const app = await getWorker();
    await app.get(MessagingService).deliver(sent.body[0].id, 0, 5);
    expect(meta.calls.some(c => c.url.endsWith('/messages') && (c.body as { to?: string }).to === '94771234567')).toBe(true);
    const [row] = await db().select().from(messages).where(eq(messages.id, sent.body[0].id));
    expect(row.status).toBe('sent');
    await app.get(MessagingService).applyStatus(a.id, row.waMessageId!, 'read', new Date(), null, null);
    await app.get(MessagingService).applyStatus(a.id, row.waMessageId!, 'delivered', new Date(), null, null);
    const [after] = await db().select().from(messages).where(eq(messages.id, row.id));
    expect(after.status).toBe('read');
  });

  it('refuses free-form messages after the 24-hour window', async () => {
    const mgr = await signIn(a.manager);
    const convId = (await mgr.get('/api/v1/conversations')).body.items[0].id as string;
    const { conversations } = await import('../src/db/schema');
    await db().update(conversations).set({ windowExpiresAt: new Date(Date.now() - 1000) }).where(eq(conversations.id, convId));
    const res = await mgr.post(`/api/v1/conversations/${convId}/messages`, { text: 'late' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WINDOW_CLOSED');
  });

  it('shows staff only their own customers and the team pool', async () => {
    const [contact] = await db().select().from(contacts).where(eq(contacts.companyId, a.id));
    await db().update(contacts).set({ ownerUserId: a.staff[0].id }).where(eq(contacts.id, contact.id));
    const s0 = await signIn(a.staff[0]);
    const s1 = await signIn(a.staff[1]);
    expect((await s0.get('/api/v1/conversations')).body.items).toHaveLength(1);
    expect((await s1.get('/api/v1/conversations')).body.items).toHaveLength(0);
    await db().update(contacts).set({ ownerUserId: null }).where(eq(contacts.id, contact.id));
    expect((await s1.get('/api/v1/conversations')).body.items).toHaveLength(1);
  });
});
