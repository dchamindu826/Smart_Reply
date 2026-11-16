import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { closeApp, createCompany, db, getApp, signIn, TestCompany } from './helpers';
import {
  auditLogs,
  businessProfiles,
  calls,
  contacts,
  conversations,
  files,
  messages,
  usageDaily,
  webhookEvents,
  whatsappAccounts
} from '../src/db/schema';
import { Storage } from '../src/infra/storage';
import { csvCell, toCsv } from '../src/modules/insight/csv';
import { addLocalDays, resolveRange, startOfLocalDay, startOfLocalWeek, zonedMidnight } from '../src/modules/insight/time';

const TZ = 'Asia/Colombo';
let seq = 0;

interface MetaCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

/** Stub Meta's Graph API. `fail` makes the business profile update answer an error. */
function stubMeta(opts: { failProfile?: boolean } = {}): MetaCall[] {
  const log: MetaCall[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://meta.test')) return real(input, init);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    log.push({ url, method, body });
    const path = new URL(url).pathname;
    if (path.endsWith('/whatsapp_business_profile') && method === 'GET') {
      return Response.json({ data: [{ about: 'From Meta', description: 'Meta description', websites: ['https://meta.example'], vertical: 'RETAIL' }] });
    }
    if (path.endsWith('/whatsapp_business_profile') && method === 'POST' && opts.failProfile) {
      return Response.json({ error: { message: 'Invalid parameter', code: 100, error_data: { details: 'Param email is not valid' } } }, { status: 400 });
    }
    if (method === 'GET' && /\/v26\.0\/\d+$/.test(path)) {
      return Response.json({
        id: path.split('/').pop(),
        display_phone_number: '+94 77 999 8888',
        verified_name: 'Fresh Name',
        name_status: 'APPROVED',
        quality_rating: 'YELLOW',
        whatsapp_business_manager_messaging_limit: 'TIER_2K'
      });
    }
    return Response.json({ success: true });
  });
  return log;
}

async function phoneNumberIdOf(companyId: string): Promise<string> {
  const [a] = await db().select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId));
  return a.phoneNumberId;
}

async function addContact(companyId: string, opts: { name?: string; owner?: string | null; firstSeenAt?: Date } = {}) {
  seq++;
  const [c] = await db()
    .insert(contacts)
    .values({
      companyId,
      waId: `9477${String(1000000 + seq).slice(-7)}`,
      name: opts.name ?? `Customer ${seq}`,
      ownerUserId: opts.owner ?? null,
      firstSeenAt: opts.firstSeenAt ?? new Date()
    })
    .returning();
  return c;
}

async function addConversation(companyId: string, contactId: string, values: Partial<typeof conversations.$inferInsert> = {}) {
  const [c] = await db()
    .insert(conversations)
    .values({ companyId, contactId, lastMessageAt: new Date(), ...values })
    .returning();
  return c;
}

async function addMessage(companyId: string, conversationId: string, direction: 'in' | 'out', at: Date, extra: Partial<typeof messages.$inferInsert> = {}) {
  await db()
    .insert(messages)
    .values({
      companyId,
      conversationId,
      direction,
      body: 'hello',
      senderKind: direction === 'in' ? 'customer' : 'user',
      status: 'delivered',
      createdAt: at,
      ...extra
    });
}

async function lastExportText(companyId: string): Promise<string> {
  const [f] = await db()
    .select()
    .from(files)
    .where(and(eq(files.companyId, companyId), eq(files.purpose, 'export')))
    .orderBy(desc(files.createdAt))
    .limit(1);
  const buf = await (await getApp()).get(Storage).get(f.storageKey);
  return buf.toString('utf8');
}

describe('insight: time boundaries', () => {
  it('uses the company timezone for local midnight', () => {
    // Colombo is UTC+05:30 all year.
    expect(zonedMidnight(2026, 11, 15, TZ).toISOString()).toBe('2026-11-14T18:30:00.000Z');
    // 23:50 UTC on the 14th is already 05:20 on the 15th in Colombo.
    expect(startOfLocalDay(new Date('2026-11-14T23:50:00Z'), TZ).toISOString()).toBe('2026-11-14T18:30:00.000Z');
    // 18:29 UTC is still the 14th locally.
    expect(startOfLocalDay(new Date('2026-11-14T18:29:00Z'), TZ).toISOString()).toBe('2026-11-13T18:30:00.000Z');
    // Weeks start on Monday (16 Nov 2026 is a Monday; the 15th a Sunday).
    expect(startOfLocalWeek(new Date('2026-11-15T10:00:00Z'), TZ).toISOString()).toBe('2026-11-08T18:30:00.000Z');
    expect(startOfLocalWeek(new Date('2026-11-16T10:00:00Z'), TZ).toISOString()).toBe('2026-11-15T18:30:00.000Z');
  });

  it('handles daylight saving days', () => {
    // New York springs forward on 8 March 2026: midnight is still EST (UTC-5).
    expect(zonedMidnight(2026, 3, 8, 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(addLocalDays(new Date('2026-03-08T12:00:00Z'), 1, 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('resolves ranges that include today', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const seven = resolveRange({ range: '7d' }, TZ, now);
    expect(seven.from.toISOString()).toBe('2026-11-08T18:30:00.000Z');
    expect(seven.to.toISOString()).toBe('2026-11-15T18:30:00.000Z');
    const month = resolveRange({ range: 'month' }, TZ, now);
    expect(month.from.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
});

describe('insight: CSV', () => {
  it('escapes quotes, commas and formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+2')).toBe("'=1+2");
    expect(csvCell('+94 77')).toBe("'+94 77");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(toCsv(['a'], [['x\ny']]).toString('utf8')).toBe('﻿a\r\n"x\ny"\r\n');
  });
});

describe('insight endpoints', () => {
  let a: TestCompany;
  let b: TestCompany;
  let meta: MetaCall[];

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

  it('counts today on the dashboard in the company timezone', async () => {
    const now = new Date();
    const dayStart = startOfLocalDay(now, TZ);
    const justAfterMidnight = new Date(dayStart.getTime() + 60_000);
    const justBefore = new Date(dayStart.getTime() - 60_000);
    const earlier = new Date(Math.max(dayStart.getTime() + 30_000, now.getTime() - 10 * 60_000));

    // Customer 1: owned by staff 0, first message today, answered after 120 s, open.
    const c1 = await addContact(a.id, { owner: a.staff[0].id });
    const v1 = await addConversation(a.id, c1.id, {
      windowExpiresAt: new Date(now.getTime() + 3600_000),
      firstResponseAt: new Date(earlier.getTime() + 120_000)
    });
    await addMessage(a.id, v1.id, 'in', earlier);
    await addMessage(a.id, v1.id, 'out', new Date(earlier.getTime() + 120_000), { senderUserId: a.staff[0].id, type: 'template' });

    // Customer 2: no owner, message just after local midnight (yesterday in UTC), open.
    const c2 = await addContact(a.id, { firstSeenAt: justBefore });
    const v2 = await addConversation(a.id, c2.id, { windowExpiresAt: new Date(now.getTime() + 20 * 3600_000) });
    await addMessage(a.id, v2.id, 'in', justAfterMidnight);
    await addMessage(a.id, v2.id, 'in', justBefore); // yesterday locally: not counted

    // Customer 3: resolved today by staff 1.
    const c3 = await addContact(a.id, { owner: a.staff[1].id, firstSeenAt: justBefore });
    await addConversation(a.id, c3.id, { status: 'resolved', resolvedAt: now, resolvedBy: a.staff[1].id });

    // Calls: one answered by staff 0, one missed, one yesterday.
    await db().insert(calls).values([
      { companyId: a.id, contactId: c1.id, direction: 'in', outcome: 'answered', handledByUserId: a.staff[0].id, startedAt: earlier, answeredAt: earlier },
      { companyId: a.id, contactId: c2.id, direction: 'in', outcome: 'missed', startedAt: earlier, ringingUserIds: [a.staff[1].id] },
      { companyId: a.id, contactId: c2.id, direction: 'in', outcome: 'missed', startedAt: justBefore }
    ]);

    // Company B data must not leak into A.
    const cb = await addContact(b.id);
    const vb = await addConversation(b.id, cb.id);
    await addMessage(b.id, vb.id, 'in', earlier);

    const mgr = await signIn(a.manager);
    const res = await mgr.get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const t = res.body.today;
    expect(t.chatsOpen).toBe(2);
    expect(t.chatsUnassigned).toBe(1);
    expect(t.chatsClosingSoon).toBe(1);
    expect(t.newCustomers).toBe(1);
    expect(t.messagesIn).toBe(2);
    expect(t.messagesOut).toBe(1);
    expect(t.callsAnswered).toBe(1);
    expect(t.callsMissed).toBe(1);
    expect(t.resolved).toBe(1);
    expect(t.avgFirstReplySeconds).toBe(120);
    expect(res.body.hourly).toHaveLength(24);
    const totalHourly = (res.body.hourly as { messages: number; calls: number }[]).reduce((n, h) => n + h.messages, 0);
    expect(totalHourly).toBe(3);
    const s0 = (res.body.team as { userId: string; openChats: number; callsToday: number }[]).find(r => r.userId === a.staff[0].id);
    expect(s0).toMatchObject({ openChats: 1, callsToday: 1 });
    const s1 = (res.body.team as { userId: string; resolved: number }[]).find(r => r.userId === a.staff[1].id);
    expect(s1?.resolved).toBe(1);

    const reports = await mgr.get('/api/v1/reports?range=7d');
    expect(reports.status).toBe(200);
    expect(reports.body.daily).toHaveLength(7);
    expect(reports.body.totals.templatesSent).toBe(1);
    const row0 = (reports.body.byStaff as { userId: string; chatsHandled: number; callsAnswered: number }[]).find(r => r.userId === a.staff[0].id);
    expect(row0).toMatchObject({ chatsHandled: 1, callsAnswered: 1 });
    const row1 = (reports.body.byStaff as { userId: string; callsMissed: number }[]).find(r => r.userId === a.staff[1].id);
    expect(row1?.callsMissed).toBe(1);
  });

  it('shows staff their own day and performance, with targets', async () => {
    const mgr = await signIn(a.manager);
    const { staffTargets } = await import('../src/db/schema');
    await db().insert(staffTargets).values({ companyId: a.id, userId: a.staff[1].id, resolvedTarget: 4 });
    const s1 = await signIn(a.staff[1]);
    const me = await s1.get('/api/v1/me/dashboard');
    expect(me.status).toBe(200);
    expect(me.body.resolvedToday).toBe(1);
    expect(me.body.targetPercent).toBe(25);
    expect(me.body.callsMissed).toBe(1);
    const perf = await s1.get('/api/v1/me/performance?range=today');
    expect(perf.status).toBe(200);
    expect(perf.body).toMatchObject({ resolved: 1, resolvedTarget: 4, targetPercent: 25 });
    const progress = await mgr.get('/api/v1/reports/progress?range=30d');
    expect(progress.status).toBe(200);
    expect(progress.body.targets).toContainEqual({ userId: a.staff[1].id, resolvedTarget: 4 });
  });

  it('refuses manager routes to staff', async () => {
    const s = await signIn(a.staff[0]);
    for (const url of [
      '/api/v1/dashboard',
      '/api/v1/reports',
      '/api/v1/reports/progress',
      '/api/v1/billing/usage',
      '/api/v1/billing/invoices',
      '/api/v1/business-profile',
      '/api/v1/whatsapp/account',
      '/api/v1/integrations/webhook',
      '/api/v1/integrations/events',
      '/api/v1/audit'
    ]) {
      expect((await s.get(url)).status, url).toBe(403);
    }
    expect((await s.put('/api/v1/business-profile', {})).status).toBe(403);
    expect((await s.post('/api/v1/integrations/test')).status).toBe(403);
    expect((await s.post('/api/v1/whatsapp/account/refresh')).status).toBe(403);
    expect((await s.post('/api/v1/exports', { kind: 'contacts' })).status).toBe(403);
    expect((await s.post('/api/v1/exports', { kind: 'conversations' })).status).toBe(403);
    const own = await s.post('/api/v1/exports', { kind: 'performance' });
    expect(own.status).toBe(200);
    expect(own.body.fileName).toMatch(/^performance-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('exports CSV with only own rows and defused formulas', async () => {
    await addContact(a.id, { name: '=HYPERLINK("http://evil","click")' });
    await addContact(b.id, { name: 'Only in company B' });
    const mgr = await signIn(a.manager);
    const res = await mgr.post('/api/v1/exports', { kind: 'contacts' });
    expect(res.status).toBe(200);
    expect(res.body.url).toBeTruthy();
    const text = await lastExportText(a.id);
    expect(text).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(text).not.toContain('Only in company B');
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);

    const calls = await mgr.post('/api/v1/exports', { kind: 'calls', params: { range: '7d' } });
    expect(calls.status).toBe(200);
    expect((await lastExportText(a.id)).split('\r\n').filter(Boolean).length).toBe(1 + 3);

    const report = await mgr.post('/api/v1/exports', { kind: 'reports' });
    expect(report.status).toBe(200);
    expect(await lastExportText(a.id)).not.toContain('hello'); // no message text outside 'conversations'

    const conv = await mgr.post('/api/v1/exports', { kind: 'conversations', params: { range: '7d' } });
    expect(conv.status).toBe(200);
    expect(await lastExportText(a.id)).toContain('hello');

    const mgrB = await signIn(b.manager);
    await mgrB.post('/api/v1/exports', { kind: 'contacts' });
    const textB = await lastExportText(b.id);
    expect(textB).toContain('Only in company B');
    expect(textB).not.toContain('HYPERLINK');
  });

  it('reports usage and invoices for the own company only', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const day = `${month}-01`;
    await db().insert(usageDaily).values([
      { companyId: a.id, date: day, category: 'marketing', deliveredCount: 10, billableCount: 10 },
      { companyId: a.id, date: day, category: 'service', deliveredCount: 7, billableCount: 0 },
      { companyId: b.id, date: day, category: 'marketing', deliveredCount: 99, billableCount: 99 }
    ]);
    const mgr = await signIn(a.manager);
    const res = await mgr.get(`/api/v1/billing/usage?month=${month}`);
    expect(res.status).toBe(200);
    expect(res.body.freeReplies).toBe(7);
    const mk = (res.body.byCategory as { category: string; billable: number; cost: { amountMinor: number; currency: string } }[]).find(c => c.category === 'marketing');
    expect(mk?.billable).toBe(10);
    expect(mk?.cost.currency).toBe('USD');
    expect(res.body.total.amountMinor).toBe(mk?.cost.amountMinor);

    const mgrB = await signIn(b.manager);
    const resB = await mgrB.get(`/api/v1/billing/usage?month=${month}`);
    expect(resB.body.freeReplies).toBe(0);
    expect(resB.body.byCategory).toHaveLength(1);
    expect(resB.body.byCategory[0].billable).toBe(99);

    expect((await mgr.get('/api/v1/billing/usage?month=2026-13')).status).toBe(400);
    expect((await mgr.get('/api/v1/billing/invoices')).body).toEqual([]);
  });

  it('pushes the business profile to WhatsApp and keeps it if Meta fails', async () => {
    const mgr = await signIn(a.manager);
    const pnid = await phoneNumberIdOf(a.id);
    const got = await mgr.get('/api/v1/business-profile');
    expect(got.status).toBe(200);
    expect(got.body.about).toBe('From Meta');
    expect(got.body.syncedAt).toBeTruthy();

    const body = {
      displayName: 'Shop',
      about: 'Fresh fruit daily',
      description: 'We deliver',
      address: 'Colombo 3',
      website: 'shop.example.lk',
      email: 'hello@shop.example.lk',
      vertical: 'retail',
      greetingText: 'Hi!',
      greetingOn: true,
      awayText: '',
      awayOn: false
    };
    const put = await mgr.put('/api/v1/business-profile', body);
    expect(put.status).toBe(200);
    expect(put.body.syncedAt).toBeTruthy();
    const call = meta.find(c => c.method === 'POST' && c.url === `http://meta.test/v26.0/${pnid}/whatsapp_business_profile`);
    expect(call?.body).toMatchObject({
      messaging_product: 'whatsapp',
      about: 'Fresh fruit daily',
      websites: ['https://shop.example.lk'],
      vertical: 'RETAIL',
      email: 'hello@shop.example.lk'
    });
    expect(call?.body).not.toHaveProperty('greetingText');

    meta = stubMeta({ failProfile: true });
    const fail = await mgr.put('/api/v1/business-profile', { ...body, about: 'Changed', vertical: 'not-a-vertical' });
    expect(fail.status).toBe(502);
    expect(fail.body.error.code).toBe('META_ERROR');
    const sent = meta.find(c => c.method === 'POST');
    expect(sent?.body).not.toHaveProperty('vertical');
    const [row] = await db().select().from(businessProfiles).where(eq(businessProfiles.companyId, a.id));
    expect(row.about).toBe('Changed');
    expect(row.syncedAt).toBeNull();
    // Reading again must not overwrite the local copy with Meta's.
    meta = stubMeta();
    expect((await mgr.get('/api/v1/business-profile')).body.about).toBe('Changed');

    const audit = await db().select().from(auditLogs).where(and(eq(auditLogs.companyId, a.id), eq(auditLogs.action, 'business_profile.update')));
    expect(audit.length).toBe(2);
  });

  it('shows the number read-only and refreshes it from Meta', async () => {
    const mgr = await signIn(a.manager);
    const view = await mgr.get('/api/v1/whatsapp/account');
    expect(view.status).toBe(200);
    expect(view.body.connected).toBe(true);
    expect(JSON.stringify(view.body)).not.toContain('test-token');
    const ref = await mgr.post('/api/v1/whatsapp/account/refresh');
    expect(ref.status).toBe(200);
    expect(ref.body).toMatchObject({ verifiedName: 'Fresh Name', qualityRating: 'YELLOW', messagingLimit: 'TIER_2K', nameStatus: 'APPROVED' });

    const lone = await createCompany({ staffCount: 0 });
    const none = await (await signIn(lone.manager)).get('/api/v1/whatsapp/account');
    expect(none.body).toMatchObject({ connected: false, phoneNumberId: null, status: 'disconnected' });
  });

  it('sends a test webhook event and keeps events per company', async () => {
    const mgr = await signIn(a.manager);
    const t = await mgr.post('/api/v1/integrations/test');
    expect(t.status).toBe(200);
    expect(t.body.ok).toBe(true);
    const [ev] = await db().select().from(webhookEvents).where(eq(webhookEvents.id, t.body.eventId));
    expect(ev.field).toBe('test');
    expect(ev.phoneNumberId).toBe(await phoneNumberIdOf(a.id));

    const events = await mgr.get('/api/v1/integrations/events');
    expect(events.status).toBe(200);
    expect((events.body as { id: string }[]).map(e => e.id)).toContain(t.body.eventId);
    expect(events.body[0]).not.toHaveProperty('payload');
    const status = await mgr.get('/api/v1/integrations/webhook');
    expect(status.body.events24h).toBeGreaterThanOrEqual(1);
    expect(status.body.callbackUrl).toBe('http://localhost:4999/api/v1/webhooks/whatsapp');
    expect(status.body.subscribed).toBe(false);

    const mgrB = await signIn(b.manager);
    expect((await mgrB.get('/api/v1/integrations/events')).body).toEqual([]);
    expect((await mgrB.get('/api/v1/integrations/webhook')).body.events24h).toBe(0);
  });

  it('pages the audit log for the own company only', async () => {
    const mgr = await signIn(a.manager);
    const first = await mgr.get('/api/v1/audit?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await mgr.get(`/api/v1/audit?limit=2&cursor=${first.body.nextCursor}`);
    const ids = new Set([...first.body.items, ...second.body.items].map((i: { id: string }) => i.id));
    expect(ids.size).toBe(first.body.items.length + second.body.items.length);
    const filtered = await mgr.get('/api/v1/audit?action=business_profile');
    expect((filtered.body.items as { action: string }[]).every(i => i.action.startsWith('business_profile'))).toBe(true);
    expect(filtered.body.items.length).toBe(2);

    const mgrB = await signIn(b.manager);
    const auditB = await mgrB.get('/api/v1/audit?limit=200');
    expect((auditB.body.items as { action: string }[]).some(i => i.action === 'business_profile.update' || i.action === 'integration.test')).toBe(false);
    // B's cursor over A's ids gives nothing.
    expect((await mgrB.get(`/api/v1/audit?cursor=${first.body.nextCursor}`)).body.items).toEqual([]);
  });
});
