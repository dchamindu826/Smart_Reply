import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeApp, createCompany, db, getApp, getWorker, signIn, TestCompany } from './helpers';
import { CallsEngine } from '../src/modules/calls/calls.engine';
import { calls, contacts, conversations, messages, presence, whatsappAccounts } from '../src/db/schema';

interface MetaCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

/** Stub Meta: record Graph calls and answer like the Cloud API. `permission` controls call_permissions. */
function stubMeta(opts: { permission?: 'no_permission' | 'temporary' | 'permanent' } = {}): { calls: MetaCall[] } {
  const recorded: MetaCall[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://meta.test')) return real(input, init);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    recorded.push({ url, method: init?.method ?? 'GET', body });
    if (url.includes('/call_permissions')) {
      const status = opts.permission ?? 'no_permission';
      return new Response(
        JSON.stringify({ permission: { status }, actions: [{ action_name: 'start_call', can_perform_action: status !== 'no_permission', limits: [] }] }),
        { status: 200 }
      );
    }
    if (url.endsWith('/messages')) {
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.${recorded.length}` }] }), { status: 200 });
    }
    if (url.endsWith('/calls') && body?.action === 'connect') {
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', calls: [{ id: `wacid.out.${recorded.length}` }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  return { calls: recorded };
}

const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\na=candidate:1 1 udp 1 1.2.3.4 5000 typ host\r\n';

async function phoneNumberIdOf(companyId: string): Promise<string> {
  const [a] = await db().select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId));
  return a.phoneNumberId;
}

async function incomingCall(companyId: string, waCallId: string, from = '94771112222'): Promise<void> {
  const engine = (await getWorker()).get(CallsEngine);
  await engine.handleCallWebhook(companyId, {
    messaging_product: 'whatsapp',
    metadata: { phone_number_id: await phoneNumberIdOf(companyId) },
    contacts: [{ profile: { name: 'Nimal Silva' }, wa_id: from }],
    calls: [
      {
        id: waCallId,
        to: '94770000000',
        from,
        event: 'connect',
        timestamp: String(Math.floor(Date.now() / 1000)),
        direction: 'USER_INITIATED',
        session: { sdp_type: 'offer', sdp: SDP }
      }
    ]
  });
}

async function callByWaId(companyId: string, waCallId: string) {
  const [row] = await db().select().from(calls).where(and(eq(calls.companyId, companyId), eq(calls.waCallId, waCallId)));
  return row;
}

async function openWindow(companyId: string, contactId: string): Promise<void> {
  await db()
    .update(conversations)
    .set({ windowExpiresAt: new Date(Date.now() + 3600_000) })
    .where(and(eq(conversations.companyId, companyId), eq(conversations.contactId, contactId)));
}

describe('calls (Stage A)', () => {
  let a: TestCompany;
  let b: TestCompany;
  let meta: ReturnType<typeof stubMeta>;

  beforeAll(async () => {
    await getApp();
    a = await createCompany({ staffCount: 3, whatsapp: true });
    b = await createCompany({ staffCount: 1, whatsapp: true });
    // staff[2] is on a break: never rung.
    await db().update(presence).set({ status: 'brk' }).where(and(eq(presence.userId, a.staff[2].id), eq(presence.channel, 'call')));
  });
  beforeEach(() => {
    meta = stubMeta();
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeApp();
  });

  it('stores an incoming call once and rings only available users', async () => {
    await incomingCall(a.id, 'wacid.in1');
    await incomingCall(a.id, 'wacid.in1');
    const rows = await db().select().from(calls).where(eq(calls.waCallId, 'wacid.in1'));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.direction).toBe('in');
    expect(row.outcome).toBe('ringing');
    expect(row.sdpOffer).toBe(SDP);
    expect(new Set(row.ringingUserIds)).toEqual(new Set([a.manager.id, a.staff[0].id, a.staff[1].id]));
    // Calling us grants temporary callback permission.
    const [c] = await db().select().from(contacts).where(eq(contacts.id, row.contactId));
    expect(c.callPermission).toBe('temporary');
    expect(c.callPermissionExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);

    const s0 = await signIn(a.staff[0]);
    const active = await s0.get('/api/v1/calls/active');
    expect(active.status).toBe(200);
    expect(active.body.ringing).toHaveLength(1);
    expect(active.body.ringing[0].sdpOffer).toBe(SDP);
    const s2 = await signIn(a.staff[2]);
    expect((await s2.get('/api/v1/calls/active')).body.ringing).toHaveLength(0);
  });

  it('lets only one device answer, with pre_accept then accept', async () => {
    const row = await callByWaId(a.id, 'wacid.in1');
    const s0 = await signIn(a.staff[0]);
    const s1 = await signIn(a.staff[1]);
    const [r0, r1] = await Promise.all([
      s0.post(`/api/v1/calls/${row.id}/answer`, { sdpAnswer: SDP }),
      s1.post(`/api/v1/calls/${row.id}/answer`, { sdpAnswer: SDP })
    ]);
    const statuses = [r0.status, r1.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r0.status === 409 ? r0 : r1;
    expect(loser.body.error.code).toBe('CALL_STATE');
    const actions = meta.calls.filter(c => c.url.endsWith('/calls')).map(c => c.body?.action);
    expect(actions).toEqual(['pre_accept', 'accept']);
    const accept = meta.calls.find(c => c.body?.action === 'accept')!;
    expect(accept.body).toMatchObject({ messaging_product: 'whatsapp', call_id: 'wacid.in1', session: { sdp_type: 'answer', sdp: SDP } });
    const after = await callByWaId(a.id, 'wacid.in1');
    expect(after.outcome).toBe('ongoing');
    const winner = r0.status === 200 ? a.staff[0] : a.staff[1];
    expect(after.handledByUserId).toBe(winner.id);
    const [p] = await db().select().from(presence).where(and(eq(presence.userId, winner.id), eq(presence.channel, 'call')));
    expect(p.status).toBe('oncall');

    // A third try after the call is taken.
    const mgr = await signIn(a.manager);
    const again = await mgr.post(`/api/v1/calls/${row.id}/answer`, { sdpAnswer: SDP });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CALL_STATE');

    // Hang up: terminate on Meta, answered, presence restored, chat line.
    const agent = winner.id === a.staff[0].id ? s0 : s1;
    const hung = await agent.post(`/api/v1/calls/${row.id}/hangup`);
    expect(hung.status).toBe(200);
    expect(hung.body.outcome).toBe('answered');
    expect(meta.calls.some(c => c.body?.action === 'terminate')).toBe(true);
    const [p2] = await db().select().from(presence).where(and(eq(presence.userId, winner.id), eq(presence.channel, 'call')));
    expect(p2.status).toBe('available');
    const lines = await db().select().from(messages).where(and(eq(messages.companyId, a.id), eq(messages.direction, 'system')));
    expect(lines.some(l => l.body.startsWith('Voice call · 0:'))).toBe(true);
  });

  it('declines with a message', async () => {
    await incomingCall(a.id, 'wacid.in2');
    const row = await callByWaId(a.id, 'wacid.in2');
    await openWindow(a.id, row.contactId);
    const s0 = await signIn(a.staff[0]);
    const res = await s0.post(`/api/v1/calls/${row.id}/decline`, { messageText: 'In a meeting, will call you back' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('rejected');
    expect(meta.calls.some(c => c.url.endsWith('/calls') && c.body?.action === 'reject' && c.body?.call_id === 'wacid.in2')).toBe(true);
    const out = await db().select().from(messages).where(and(eq(messages.companyId, a.id), eq(messages.direction, 'out')));
    expect(out.some(m => m.body === 'In a meeting, will call you back' && m.senderUserId === a.staff[0].id)).toBe(true);
    // Not rung any more → cannot answer.
    const late = await s0.post(`/api/v1/calls/${row.id}/answer`, { sdpAnswer: SDP });
    expect(late.status).toBe(409);
  });

  it('marks a call missed when the ring timer runs out and sends the missed-call message', async () => {
    await incomingCall(a.id, 'wacid.in3');
    const row = await callByWaId(a.id, 'wacid.in3');
    await openWindow(a.id, row.contactId);
    const engine = (await getWorker()).get(CallsEngine);
    await engine.ringTimeout(row.id, 5); // stale round: nothing happens
    expect((await callByWaId(a.id, 'wacid.in3')).outcome).toBe('ringing');
    await engine.ringTimeout(row.id, 0);
    await engine.ringTimeout(row.id, 0); // safe to run twice
    const after = await callByWaId(a.id, 'wacid.in3');
    expect(after.outcome).toBe('missed');
    expect(meta.calls.filter(c => c.body?.action === 'reject' && c.body?.call_id === 'wacid.in3')).toHaveLength(1);
    const msgs = await db().select().from(messages).where(eq(messages.companyId, a.id));
    expect(msgs.filter(m => m.direction === 'out' && m.body === 'Sorry we missed your call. We will call you back soon.')).toHaveLength(1);
    expect(msgs.some(m => m.direction === 'system' && m.body === 'Missed call')).toBe(true);

    const mgr = await signIn(a.manager);
    const missed = await mgr.get('/api/v1/calls?filter=missed');
    expect(missed.status).toBe(200);
    expect(missed.body.items.map((c: { id: string }) => c.id)).toContain(row.id);
  });

  it('refuses an outgoing call without calling enabled or without permission', async () => {
    const [contact] = await db().select().from(contacts).where(eq(contacts.companyId, a.id));
    const s0 = await signIn(a.staff[0]);
    const off = await s0.post('/api/v1/calls', { contactId: contact.id, sdpOffer: SDP });
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe('CALLING_NOT_ENABLED');

    await db().update(whatsappAccounts).set({ callingEnabled: true }).where(eq(whatsappAccounts.companyId, a.id));
    const res = await s0.post('/api/v1/calls', { contactId: contact.id, sdpOffer: SDP });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CALL_PERMISSION_MISSING');
    expect(meta.calls.some(c => c.body?.action === 'connect')).toBe(false);
  });

  it('dials out with permission and follows Meta status events', async () => {
    meta = stubMeta({ permission: 'temporary' });
    const [contact] = await db().select().from(contacts).where(eq(contacts.companyId, a.id));
    const s0 = await signIn(a.staff[0]);
    const res = await s0.post('/api/v1/calls', { contactId: contact.id, sdpOffer: SDP });
    expect(res.status).toBe(201);
    expect(res.body.direction).toBe('out');
    const connect = meta.calls.find(c => c.body?.action === 'connect')!;
    expect(connect.body).toMatchObject({ to: contact.waId, session: { sdp_type: 'offer', sdp: SDP }, biz_opaque_callback_data: res.body.id });
    const [row] = await db().select().from(calls).where(eq(calls.id, res.body.id));
    const engine = (await getWorker()).get(CallsEngine);
    await engine.handleCallStatus(a.id, { id: row.waCallId, type: 'call', status: 'ACCEPTED', timestamp: String(Math.floor(Date.now() / 1000)) });
    expect((await db().select().from(calls).where(eq(calls.id, row.id)))[0].outcome).toBe('ongoing');
    await engine.handleCallWebhook(a.id, {
      calls: [{ id: row.waCallId, event: 'terminate', status: 'COMPLETED', direction: 'BUSINESS_INITIATED', duration: 42 }]
    });
    const [done] = await db().select().from(calls).where(eq(calls.id, row.id));
    expect(done.outcome).toBe('answered');
    expect(done.durationSeconds).toBe(42);
  });

  it('keeps calls, scheduled calls and settings inside the company', async () => {
    const row = await callByWaId(a.id, 'wacid.in1');
    const mgrB = await signIn(b.manager);
    expect((await mgrB.get(`/api/v1/calls/${row.id}`)).status).toBe(404);
    expect((await mgrB.post(`/api/v1/calls/${row.id}/notes`, { note: 'x' })).status).toBe(404);
    expect((await mgrB.post(`/api/v1/calls/${row.id}/hangup`)).status).toBe(404);
    expect((await mgrB.get('/api/v1/calls')).body.items).toHaveLength(0);

    const mgrA = await signIn(a.manager);
    const sched = await mgrA.post('/api/v1/scheduled-calls', { contactId: row.contactId, scheduledAt: new Date(Date.now() + 3600_000).toISOString(), note: 'Follow up' });
    expect(sched.status).toBe(201);
    expect((await mgrB.delete(`/api/v1/scheduled-calls/${sched.body.id}`)).status).toBe(404);
    expect((await mgrB.post(`/api/v1/scheduled-calls/${sched.body.id}/done`)).status).toBe(404);
    expect((await mgrB.get('/api/v1/scheduled-calls')).body).toHaveLength(0);
    expect((await mgrB.post('/api/v1/scheduled-calls', { contactId: row.contactId, scheduledAt: new Date().toISOString() })).status).toBe(404);

    const settings = (await mgrA.get('/api/v1/call-settings')).body;
    const put = await mgrA.put('/api/v1/call-settings', {
      breakMaxMinutes: settings.breakMaxMinutes,
      ringStrategy: 'rr',
      ringSeconds: 15,
      recording: settings.recording,
      linkPreviews: settings.linkPreviews,
      forwarding: settings.forwarding,
      hours: settings.hours
    });
    expect(put.status).toBe(200);
    expect(put.body.ringSeconds).toBe(15);
    // Calling is on for A, so the hours went to Meta.
    expect(meta.calls.some(c => c.url.endsWith('/settings') && c.body && 'calling' in c.body)).toBe(true);
    const bs = await mgrB.get('/api/v1/call-settings');
    expect(bs.body.ringSeconds).toBe(20);
    expect(bs.body.callingEnabled).toBe(false);
    expect(bs.body.callingUnavailableReason).toBeTruthy();
  });

  it('keeps call settings for managers', async () => {
    const s0 = await signIn(a.staff[0]);
    expect((await s0.put('/api/v1/call-settings', {})).status).toBe(403);
    expect((await s0.get('/api/v1/call-settings')).status).toBe(403);
    expect((await s0.put('/api/v1/ivr', {})).status).toBe(403);
    expect((await s0.get('/api/v1/me/forwarding')).status).toBe(200);
  });

  it('answers Stage B actions with NOT_AVAILABLE and walks the IVR', async () => {
    const row = await callByWaId(a.id, 'wacid.in1');
    const mgr = await signIn(a.manager);
    const hold = await mgr.post(`/api/v1/calls/${row.id}/hold`);
    expect(hold.status).toBe(501);
    expect(hold.body.error.code).toBe('NOT_AVAILABLE');
    const put = await mgr.put('/api/v1/ivr', {
      enabled: true,
      greetingMode: 'tts',
      greetingText: 'Welcome',
      waitSeconds: 5,
      noInputDestination: 'queue',
      afterHoursEnabled: false,
      options: [{ digit: '1', label: 'Sales', destination: `user:${a.staff[0].id}` }]
    });
    expect(put.status).toBe(200);
    expect(put.body.stageBRequired).toBe(true);
    const t = await mgr.post('/api/v1/ivr/test', { keys: '1' });
    expect(t.status).toBe(200);
    expect(t.body.path[1]).toBe('Pressed 1: Sales');
    expect(t.body.path[2]).toBe(`Ring ${a.staff[0].name}`);
  });
});
