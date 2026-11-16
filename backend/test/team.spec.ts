import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, isNull } from 'drizzle-orm';
import { initialsOf } from '@smart-reply/shared';
import { closeApp, createCompany, createUser, db, getApp, PASSWORD, signIn as realSignIn, TestCompany, TestUser, Agent } from './helpers';
import { breakLog, companies, contactOwnerHistory, contacts, invites, users } from '../src/db/schema';
import { RateLimiter } from '../src/infra/rate-limit';

/** Sign in without tripping the login rate limit (these tests sign in many times from one IP). */
async function signIn(user: TestUser): Promise<Agent> {
  const limiter = (await getApp()).get(RateLimiter);
  for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) await limiter.reset(`login:ip:${ip}`);
  await limiter.reset(`login:email:${user.email}`);
  return realSignIn(user);
}

function tokenOf(link: string): string {
  return link.split('/invite/')[1];
}

describe('team: seats and invites', () => {
  beforeAll(async () => {
    await getApp();
  });
  afterAll(closeApp);

  it('refuses an invite once seats are full (active + invited + pending)', async () => {
    const co = await createCompany({ staffCount: 1, seatLimit: 3 });
    const mgr = await signIn(co.manager);
    const first = await mgr.post('/api/v1/staff/invites', { name: 'Nimali Silva', email: `nimali.${co.id.slice(-6)}@test.local` });
    expect(first.status).toBe(201);
    expect(first.body.link).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}$/);
    const seats = await mgr.get('/api/v1/seats');
    expect(seats.body).toMatchObject({ used: 2, pendingInvites: 1, limit: 3 });
    const second = await mgr.post('/api/v1/staff/invites', { name: 'Ruwan', email: `ruwan.${co.id.slice(-6)}@test.local` });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SEAT_LIMIT_REACHED');
    // Cancelling the pending invite frees its seat.
    expect((await mgr.delete(`/api/v1/staff/invites/${first.body.id}`)).status).toBe(204);
    expect((await mgr.post('/api/v1/staff/invites', { name: 'Ruwan', email: `ruwan.${co.id.slice(-6)}@test.local` })).status).toBe(201);
  });

  it('never allows more than 100 seats, whatever the company row says', async () => {
    const co = await createCompany({ staffCount: 0 });
    await db().update(companies).set({ seatLimit: 150 }).where(eq(companies.id, co.id));
    const extra = Array.from({ length: 99 }, (_, i) => {
      const name = `Bulk Staff ${i}`;
      return { companyId: co.id, role: 'staff' as const, name, initials: initialsOf(name), email: `bulk${i}.${co.id}@test.local`, status: 'active' as const };
    });
    await db().insert(users).values(extra);
    const mgr = await signIn(co.manager);
    expect((await mgr.get('/api/v1/seats')).body).toMatchObject({ used: 100, limit: 100 });
    const res = await mgr.post('/api/v1/staff/invites', { name: 'One Too Many', email: `toomany.${co.id.slice(-6)}@test.local` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEAT_LIMIT_REACHED');
  });

  it('refuses an email that already has an account', async () => {
    const co = await createCompany({ staffCount: 1 });
    const mgr = await signIn(co.manager);
    const res = await mgr.post('/api/v1/staff/invites', { name: 'Dup', email: co.staff[0].email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('runs the invite flow end to end through accept', async () => {
    const co = await createCompany({ staffCount: 0 });
    const mgr = await signIn(co.manager);
    const email = `kasun.${co.id.slice(-8)}@test.local`;
    const inv = await mgr.post('/api/v1/staff/invites', { name: 'Kasun Perera', email, title: 'Sales' });
    expect(inv.status).toBe(201);
    const pending = await mgr.get('/api/v1/staff/invites');
    expect(pending.body.map((i: { id: string }) => i.id)).toContain(inv.body.id);
    expect(pending.body[0].link).toBeUndefined();

    // Resending makes a new link; the old one stops working.
    const resent = await mgr.post(`/api/v1/staff/invites/${inv.body.id}/resend`);
    expect(resent.status).toBe(200);
    expect(resent.body.link).not.toBe(inv.body.link);
    const http = (await getApp()).getHttpServer();
    const old = await request(http).post(`/api/v1/auth/invite/${tokenOf(inv.body.link)}/accept`).send({ password: 'NewPass123!' });
    expect(old.status).toBe(401);

    const accepted = await request(http).post(`/api/v1/auth/invite/${tokenOf(resent.body.link)}/accept`).send({ password: 'NewPass123!' });
    expect(accepted.status).toBe(200);
    const [row] = await db().select().from(invites).where(eq(invites.id, inv.body.id));
    expect(row.acceptedAt).not.toBeNull();

    const staff = await mgr.get('/api/v1/staff');
    const joined = staff.body.find((m: { email: string }) => m.email === email);
    expect(joined).toMatchObject({ role: 'staff', status: 'active', title: 'Sales', name: 'Kasun Perera' });
    expect(joined.presence.chat.status).toBe('available');
    expect((await mgr.get('/api/v1/staff/invites')).body).toHaveLength(0);
    const login = await request(http).post('/api/v1/auth/login').send({ email, password: 'NewPass123!' });
    expect(login.status).toBe(200);
  });
});

describe('team: roles and isolation', () => {
  let a: TestCompany;
  let b: TestCompany;
  beforeAll(async () => {
    await getApp();
    a = await createCompany({ staffCount: 2 });
    b = await createCompany({ staffCount: 1 });
  });
  afterAll(closeApp);

  it('keeps staff out of manager routes', async () => {
    const st = await signIn(a.staff[0]);
    const other = a.staff[1].id;
    const checks = [
      st.post('/api/v1/staff/invites', { name: 'X', email: 'x.forbidden@test.local' }),
      st.get('/api/v1/staff/invites'),
      st.patch(`/api/v1/staff/${other}`, { title: 'Boss' }),
      st.delete(`/api/v1/staff/${other}`),
      st.get(`/api/v1/staff/${other}/summary`),
      st.put(`/api/v1/staff/${other}/presence`, { channel: 'chat', status: 'away' }),
      st.get('/api/v1/seats'),
      st.get('/api/v1/roles'),
      st.patch('/api/v1/roles/staff', { staff: { seeAllChats: true } }),
      st.get('/api/v1/presence'),
      st.get('/api/v1/breaks'),
      st.get('/api/v1/assignment-rules'),
      st.get('/api/v1/keyword-rules'),
      st.post('/api/v1/keyword-rules', { keywords: ['price'] }),
      st.get('/api/v1/targets'),
      st.put('/api/v1/targets', { targets: [] })
    ];
    for (const res of await Promise.all(checks)) {
      expect(res.status).toBe(403);
    }
  });

  it('gives staff a reduced staff list and managers the full one', async () => {
    const st = await signIn(a.staff[0]);
    const brief = await st.get('/api/v1/staff');
    expect(brief.status).toBe(200);
    expect(brief.body).toHaveLength(3);
    expect(brief.body[0].role).toBe('manager');
    expect(brief.body[0].email).toBeUndefined();
    expect(brief.body[0].stats).toBeUndefined();
    expect(brief.body[0].presence.call).toBeTruthy();
    const mgr = await signIn(a.manager);
    const full = await mgr.get('/api/v1/staff');
    const s0 = full.body.find((m: { id: string }) => m.id === a.staff[0].id);
    expect(s0.stats).toMatchObject({ openChats: 0, callsToday: 0, resolved: 0, targetPercent: 0, avgFirstReplySeconds: null });
    expect(s0.permissions.replyAssigned).toBe(true);
    expect(s0.permissions.seeAllChats).toBe(false);
  });

  it('answers 404 for another company’s staff and invites', async () => {
    const mgrB = await signIn(b.manager);
    const target = a.staff[0].id;
    expect((await mgrB.patch(`/api/v1/staff/${target}`, { title: 'Hacked' })).status).toBe(404);
    expect((await mgrB.delete(`/api/v1/staff/${target}`)).status).toBe(404);
    expect((await mgrB.get(`/api/v1/staff/${target}/summary`)).status).toBe(404);
    expect((await mgrB.put(`/api/v1/staff/${target}/presence`, { channel: 'both', status: 'away' })).status).toBe(404);
    const mgrA = await signIn(a.manager);
    const inv = await mgrA.post('/api/v1/staff/invites', { name: 'Pending', email: `pending.${a.id.slice(-8)}@test.local` });
    expect((await mgrB.delete(`/api/v1/staff/invites/${inv.body.id}`)).status).toBe(404);
    expect((await mgrB.post(`/api/v1/staff/invites/${inv.body.id}/resend`)).status).toBe(404);
    expect((await mgrB.put('/api/v1/targets', { targets: [{ userId: target, resolvedTarget: 5 }] })).status).toBe(404);
    expect((await mgrB.post('/api/v1/keyword-rules', { keywords: ['x'], assignUserId: target })).status).toBe(404);
    const [row] = await db().select().from(users).where(eq(users.id, target));
    expect(row.title).not.toBe('Hacked');
  });

  it('applies role and personal permission changes to staff sessions', async () => {
    const mgr = await signIn(a.manager);
    const st = await signIn(a.staff[1]);
    expect((await st.get('/api/v1/me')).body.permissions.createTemplates).toBe(false);
    const roles = await mgr.patch('/api/v1/roles/staff', { staff: { createTemplates: true } });
    expect(roles.status).toBe(200);
    expect(roles.body.staff.createTemplates).toBe(true);
    expect((await st.get('/api/v1/me')).body.permissions.createTemplates).toBe(true);
    const upd = await mgr.patch(`/api/v1/staff/${a.staff[1].id}`, { permissions: { createTemplates: false }, note: 'Night shift' });
    expect(upd.status).toBe(200);
    expect(upd.body.permissions.createTemplates).toBe(false);
    expect(upd.body.note).toBe('Night shift');
    expect((await st.get('/api/v1/me')).body.permissions.createTemplates).toBe(false);
  });

  it('stores assignment rules, keyword rules and targets', async () => {
    const mgr = await signIn(a.manager);
    const defaults = await mgr.get('/api/v1/assignment-rules');
    expect(defaults.body.autoAssign).toBe('round_robin');
    const rules = {
      autoAssign: 'least_open',
      stickyOwner: false,
      maxOpenChats: 10,
      unassignedAlertMinutes: 5,
      callRingOwnerFirst: false,
      missedCallTemplateId: null,
      skipOnBreak: true
    };
    expect((await mgr.put('/api/v1/assignment-rules', rules)).body).toEqual(rules);
    const kw = await mgr.post('/api/v1/keyword-rules', { keywords: ['Price', 'price', 'rate'], assignUserId: a.staff[0].id });
    expect(kw.status).toBe(201);
    expect(kw.body.keywords).toEqual(['price', 'rate']);
    const patched = await mgr.patch(`/api/v1/keyword-rules/${kw.body.id}`, { enabled: false });
    expect(patched.body.enabled).toBe(false);
    expect(patched.body.assignUserId).toBe(a.staff[0].id);
    expect((await mgr.get('/api/v1/keyword-rules')).body).toHaveLength(1);
    expect((await mgr.delete(`/api/v1/keyword-rules/${kw.body.id}`)).status).toBe(204);
    const targets = await mgr.put('/api/v1/targets', { targets: [{ userId: a.staff[0].id, resolvedTarget: 20 }] });
    expect(targets.status).toBe(200);
    expect(targets.body.find((t: { userId: string }) => t.userId === a.staff[0].id).resolvedTarget).toBe(20);
  });
});

describe('team: disabling staff', () => {
  let co: TestCompany;
  beforeAll(async () => {
    await getApp();
    co = await createCompany({ staffCount: 2 });
  });
  afterAll(closeApp);

  it('returns their customers to the pool and ends their session', async () => {
    const mgr = await signIn(co.manager);
    const victim = co.staff[0];
    const c1 = await mgr.post('/api/v1/contacts', { name: 'Customer One', phone: '+94771110001', ownerUserId: victim.id });
    const c2 = await mgr.post('/api/v1/contacts', { name: 'Customer Two', phone: '+94771110002', ownerUserId: victim.id });
    expect(c1.status).toBe(201);
    expect(c1.body.ownerUserId).toBe(victim.id);
    const st = await signIn(victim);
    expect((await st.get('/api/v1/me')).status).toBe(200);
    const summary = await mgr.get(`/api/v1/staff/${victim.id}/summary`);
    expect(summary.body.assignedCustomers).toBe(2);

    const res = await mgr.delete(`/api/v1/staff/${victim.id}`);
    expect(res.status).toBe(204);

    expect((await st.get('/api/v1/me')).status).toBe(401);
    const login = await request((await getApp()).getHttpServer()).post('/api/v1/auth/login').send({ email: victim.email, password: PASSWORD });
    expect(login.status).not.toBe(200);
    const owned = await db().select().from(contacts).where(and(eq(contacts.companyId, co.id), eq(contacts.ownerUserId, victim.id)));
    expect(owned).toHaveLength(0);
    const hist = await db().select().from(contactOwnerHistory).where(eq(contactOwnerHistory.contactId, c2.body.id));
    expect(hist.some(h => h.actorKind === 'system' && h.reason === 'Staff member removed' && h.toUserId === null)).toBe(true);
    const ownerHist = await mgr.get(`/api/v1/contacts/${c1.body.id}/owner-history`);
    expect(ownerHist.body[0]).toMatchObject({ actorName: 'System', fromUserId: victim.id, toUserId: null, reason: 'Staff member removed' });

    // Gone from the list unless asked for, and the seat is free.
    expect((await mgr.get('/api/v1/staff')).body.some((m: { id: string }) => m.id === victim.id)).toBe(false);
    const withDisabled = await mgr.get('/api/v1/staff?include=disabled');
    expect(withDisabled.body.find((m: { id: string }) => m.id === victim.id).status).toBe('disabled');
    expect((await mgr.get('/api/v1/seats')).body.used).toBe(2);
  });

  it('does not let a manager disable themselves', async () => {
    const mgr = await signIn(co.manager);
    const res = await mgr.patch(`/api/v1/staff/${co.manager.id}`, { status: 'disabled' });
    expect(res.status).toBe(403);
    const [row] = await db().select().from(users).where(eq(users.id, co.manager.id));
    expect(row.status).toBe('active');
  });

  it('lets a manager disable another manager while one stays active', async () => {
    const m2 = await createUser(co.id, 'manager');
    const mgr = await signIn(co.manager);
    const res = await mgr.patch(`/api/v1/staff/${m2.id}`, { status: 'disabled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disabled');
  });
});

describe('team: presence and breaks', () => {
  let co: TestCompany;
  beforeAll(async () => {
    await getApp();
    co = await createCompany({ staffCount: 1 });
  });
  afterAll(closeApp);

  it('opens a break on both channels and closes it when the last channel leaves break', async () => {
    const st = await signIn(co.staff[0]);
    const uid = co.staff[0].id;
    const on = await st.put('/api/v1/me/presence', { channel: 'both', status: 'brk', reason: 'Lunch', plannedMinutes: 30 });
    expect(on.status).toBe(200);
    expect(on.body.call).toMatchObject({ status: 'brk', reason: 'Lunch', plannedMinutes: 30 });
    expect(on.body.chat.status).toBe('brk');
    let open = await db().select().from(breakLog).where(and(eq(breakLog.userId, uid), isNull(breakLog.endedAt)));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ scope: 'both', reason: 'Lunch', plannedMinutes: 30 });

    const mine = await st.get('/api/v1/me/breaks');
    expect(mine.status).toBe(200);
    expect(mine.body.limitMinutes).toBe(60);
    expect(mine.body.entries).toHaveLength(1);
    expect(mine.body.entries[0].endedAt).toBeNull();

    // Back on chat only: still on break for calls.
    const half = await st.put('/api/v1/me/presence', { channel: 'chat', status: 'available' });
    expect(half.body.chat.status).toBe('available');
    expect(half.body.call.status).toBe('brk');
    open = await db().select().from(breakLog).where(and(eq(breakLog.userId, uid), isNull(breakLog.endedAt)));
    expect(open).toHaveLength(1);
    expect(open[0].scope).toBe('call');

    // The manager ends the break from Live status.
    const mgr = await signIn(co.manager);
    const end = await mgr.put(`/api/v1/staff/${uid}/presence`, { channel: 'call', status: 'available' });
    expect(end.status).toBe(200);
    expect(end.body.call.status).toBe('available');
    open = await db().select().from(breakLog).where(and(eq(breakLog.userId, uid), isNull(breakLog.endedAt)));
    expect(open).toHaveLength(0);

    const board = await mgr.get('/api/v1/presence');
    expect(board.body.find((p: { id: string }) => p.id === uid).presence.call.status).toBe('available');
    const breaks = await mgr.get('/api/v1/breaks');
    const row = breaks.body.find((b: { userId: string }) => b.userId === uid);
    expect(row.entries).toHaveLength(1);
    expect(row.entries[0].endedAt).not.toBeNull();
    const summary = await mgr.get(`/api/v1/staff/${uid}/summary`);
    expect(summary.body.breaks.entries).toHaveLength(1);
    expect((await mgr.get('/api/v1/breaks?date=2020-01-01')).body.find((b: { userId: string }) => b.userId === uid).entries).toHaveLength(0);
    expect((await mgr.get('/api/v1/breaks?date=yesterday')).status).toBe(400);
  });

  it('keeps "since" when only the reason changes and validates the body', async () => {
    const st = await signIn(co.staff[0]);
    const a = await st.put('/api/v1/me/presence', { channel: 'chat', status: 'dnd', reason: 'Meeting' });
    const b = await st.put('/api/v1/me/presence', { channel: 'chat', status: 'dnd', reason: 'Client meeting' });
    expect(b.body.chat.since).toBe(a.body.chat.since);
    expect(b.body.chat.reason).toBe('Client meeting');
    expect((await st.put('/api/v1/me/presence', { channel: 'phone', status: 'dnd' })).status).toBe(400);
  });
});
