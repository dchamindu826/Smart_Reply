import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Agent, closeApp, createCompany, db, getApp, signIn as realSignIn, TestCompany, TestUser } from './helpers';
import { calls, contacts, conversations, messages } from '../src/db/schema';
import { RateLimiter } from '../src/infra/rate-limit';

/** Sign in without tripping the login rate limit (these tests sign in many times from one IP). */
async function signIn(user: TestUser): Promise<Agent> {
  const limiter = (await getApp()).get(RateLimiter);
  for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) await limiter.reset(`login:ip:${ip}`);
  await limiter.reset(`login:email:${user.email}`);
  return realSignIn(user);
}

describe('contacts', () => {
  let a: TestCompany;
  let b: TestCompany;
  let mgrA: Agent;
  let mgrB: Agent;
  let s0: Agent;
  let s1: Agent;

  beforeAll(async () => {
    await getApp();
    a = await createCompany({ staffCount: 2 });
    b = await createCompany({ staffCount: 1 });
    mgrA = await signIn(a.manager);
    mgrB = await signIn(b.manager);
    s0 = await signIn(a.staff[0]);
    s1 = await signIn(a.staff[1]);
  });
  afterAll(closeApp);

  it('creates a customer with a normalised number and refuses duplicates', async () => {
    const res = await mgrA.post('/api/v1/contacts', { name: 'Amal Fernando', phone: '077 123 4567', city: 'Kandy' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ waId: '94771234567', phone: '+94 77 123 4567', ownerUserId: null, city: 'Kandy' });
    const conv = await db().select().from(conversations).where(eq(conversations.contactId, res.body.id));
    expect(conv).toHaveLength(1);
    expect(conv[0].lastMessageAt).toBeNull();
    // Not in the chat list until a message arrives.
    expect((await mgrA.get('/api/v1/conversations')).body.items).toHaveLength(0);
    const dupe = await mgrA.post('/api/v1/contacts', { name: 'Again', phone: '+94771234567' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.code).toBe('CONFLICT');
    expect(dupe.body.error.message).toContain('Amal Fernando');
  });

  it('makes staff the owner of customers they add', async () => {
    const res = await s0.post('/api/v1/contacts', { name: 'Staff Lead', phone: '+94772000001', ownerUserId: a.staff[1].id });
    expect(res.status).toBe(201);
    expect(res.body.ownerUserId).toBe(a.staff[0].id);
  });

  it('lists with staff visibility, search and owner filters', async () => {
    const own = await s1.post('/api/v1/contacts', { name: 'Nuwan Own', phone: '+94772000002' });
    expect(own.status).toBe(201);
    const names = (r: { body: { items: { name: string }[] } }) => r.body.items.map(i => i.name).sort();
    expect(names(await s1.get('/api/v1/contacts'))).toEqual(['Amal Fernando', 'Nuwan Own']);
    expect(names(await s0.get('/api/v1/contacts'))).toEqual(['Amal Fernando', 'Staff Lead']);
    expect((await mgrA.get('/api/v1/contacts')).body.items).toHaveLength(3);
    expect(names(await mgrA.get('/api/v1/contacts?search=1234'))).toEqual(['Amal Fernando']);
    expect(names(await mgrA.get('/api/v1/contacts?search=nuwan'))).toEqual(['Nuwan Own']);
    expect(names(await mgrA.get('/api/v1/contacts?owner=none'))).toEqual(['Amal Fernando']);
    expect(names(await s1.get('/api/v1/contacts?owner=me'))).toEqual(['Nuwan Own']);
    const p1 = await mgrA.get('/api/v1/contacts?limit=2');
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await mgrA.get(`/api/v1/contacts?limit=2&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
    expect((await mgrB.get('/api/v1/contacts')).body.items).toHaveLength(0);
  });

  it('enforces the staff owner-change rules', async () => {
    const pool = await mgrA.post('/api/v1/contacts', { name: 'Pool Customer', phone: '+94773000001' });
    const pool2 = await mgrA.post('/api/v1/contacts', { name: 'Pool Two', phone: '+94773000002' });
    const theirs = await mgrA.post('/api/v1/contacts', { name: 'Theirs', phone: '+94773000003', ownerUserId: a.staff[0].id });

    // Someone else's customer is invisible to staff: 404.
    expect((await s1.put(`/api/v1/contacts/${theirs.body.id}/owner`, { ownerUserId: a.staff[1].id })).status).toBe(404);
    // A pool customer may only be taken for yourself.
    expect((await s1.put(`/api/v1/contacts/${pool2.body.id}/owner`, { ownerUserId: a.staff[0].id })).status).toBe(403);
    const take = await s1.put(`/api/v1/contacts/${pool.body.id}/owner`, { ownerUserId: a.staff[1].id, reason: 'Called me' });
    expect(take.status).toBe(200);
    expect(take.body.ownerUserId).toBe(a.staff[1].id);
    // Transfer own to a colleague; then it is no longer visible.
    const give = await s1.put(`/api/v1/contacts/${pool.body.id}/owner`, { ownerUserId: a.staff[0].id });
    expect(give.status).toBe(200);
    expect(give.body.ownerUserId).toBe(a.staff[0].id);
    expect((await s1.get(`/api/v1/contacts/${pool.body.id}`)).status).toBe(404);
    // Release own to the pool.
    const rel = await s0.put(`/api/v1/contacts/${pool.body.id}/owner`, { ownerUserId: null });
    expect(rel.status).toBe(200);
    expect(rel.body.ownerUserId).toBeNull();

    // "See all chats" lets staff see, not move, others' customers.
    expect((await mgrA.patch(`/api/v1/staff/${a.staff[1].id}`, { permissions: { seeAllChats: true } })).status).toBe(200);
    const s1all = s1;
    expect((await s1all.get(`/api/v1/contacts/${theirs.body.id}`)).status).toBe(200);
    expect((await s1all.put(`/api/v1/contacts/${theirs.body.id}/owner`, { ownerUserId: a.staff[1].id })).status).toBe(403);
    await mgrA.patch(`/api/v1/staff/${a.staff[1].id}`, { permissions: { seeAllChats: false } });

    // Managers move anything; history records names.
    expect((await mgrA.put(`/api/v1/contacts/${theirs.body.id}/owner`, { ownerUserId: a.staff[1].id, reason: 'Holiday' })).status).toBe(200);
    const hist = await mgrA.get(`/api/v1/contacts/${pool.body.id}/owner-history`);
    expect(hist.status).toBe(200);
    expect(hist.body).toHaveLength(3);
    expect(hist.body[2]).toMatchObject({ fromUserId: null, toUserId: a.staff[1].id, toName: a.staff[1].name, actorName: a.staff[1].name, reason: 'Called me' });
    expect(hist.body[0]).toMatchObject({ fromName: a.staff[0].name, toUserId: null, actorKind: 'user' });
    // A system line is written in the chat.
    const conv = await db().select().from(conversations).where(eq(conversations.contactId, pool.body.id));
    const lines = await db().select().from(messages).where(eq(messages.conversationId, conv[0].id));
    expect(lines.filter(m => m.direction === 'system')).toHaveLength(3);
  });

  it('moves many customers at once (manager only)', async () => {
    const x = await mgrA.post('/api/v1/contacts', { name: 'Bulk X', phone: '+94774000001' });
    const y = await mgrA.post('/api/v1/contacts', { name: 'Bulk Y', phone: '+94774000002' });
    const res = await mgrA.post('/api/v1/contacts/bulk/owner', { contactIds: [x.body.id, y.body.id], ownerUserId: a.staff[0].id });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(2);
    expect((await mgrA.post('/api/v1/contacts/bulk/owner', { contactIds: [x.body.id], ownerUserId: a.staff[0].id })).body.changed).toBe(0);
    expect((await s0.post('/api/v1/contacts/bulk/owner', { contactIds: [x.body.id], ownerUserId: null })).status).toBe(403);
    // Another company's ids are ignored.
    expect((await mgrB.post('/api/v1/contacts/bulk/owner', { contactIds: [x.body.id], ownerUserId: null })).body.changed).toBe(0);
    expect((await mgrB.post('/api/v1/contacts/bulk/owner', { contactIds: [x.body.id], ownerUserId: a.staff[0].id })).status).toBe(404);
  });

  it('manages labels and keeps them per company', async () => {
    const lbl = await mgrA.post('/api/v1/labels', { name: 'VIP', color: 'ok' });
    expect(lbl.status).toBe(201);
    expect((await mgrA.post('/api/v1/labels', { name: 'vip' })).status).toBe(409);
    expect((await s0.post('/api/v1/labels', { name: 'Mine' })).status).toBe(403);
    const lblB = await mgrB.post('/api/v1/labels', { name: 'VIP' });
    expect(lblB.status).toBe(201);

    const c = await s0.post('/api/v1/contacts', { name: 'Labelled', phone: '+94775000001' });
    const set = await s0.put(`/api/v1/contacts/${c.body.id}/labels`, { labelIds: [lbl.body.id] });
    expect(set.status).toBe(200);
    expect(set.body.labels).toEqual([{ id: lbl.body.id, name: 'VIP', color: 'ok' }]);
    expect((await s0.put(`/api/v1/contacts/${c.body.id}/labels`, { labelIds: [lblB.body.id] })).status).toBe(404);
    const list = await s0.get('/api/v1/labels');
    expect(list.status).toBe(200);
    expect(list.body.find((l: { id: string }) => l.id === lbl.body.id).chatCount).toBe(1);
    expect((await mgrA.get(`/api/v1/contacts?label=${lbl.body.id}`)).body.items.map((i: { id: string }) => i.id)).toEqual([c.body.id]);

    expect((await mgrB.patch(`/api/v1/labels/${lbl.body.id}`, { name: 'Stolen' })).status).toBe(404);
    expect((await mgrB.delete(`/api/v1/labels/${lbl.body.id}`)).status).toBe(404);
    const renamed = await mgrA.patch(`/api/v1/labels/${lbl.body.id}`, { name: 'Gold' });
    expect(renamed.body).toMatchObject({ name: 'Gold', chatCount: 1 });
    expect((await mgrA.delete(`/api/v1/labels/${lbl.body.id}`)).status).toBe(204);
    expect((await s0.get(`/api/v1/contacts/${c.body.id}`)).body.labels).toEqual([]);
  });

  it('answers 404 to another company for every customer route', async () => {
    const c = await mgrA.post('/api/v1/contacts', { name: 'Private', phone: '+94776000001' });
    const id = c.body.id as string;
    const res = await Promise.all([
      mgrB.get(`/api/v1/contacts/${id}`),
      mgrB.patch(`/api/v1/contacts/${id}`, { name: 'Changed' }),
      mgrB.put(`/api/v1/contacts/${id}/owner`, { ownerUserId: null }),
      mgrB.get(`/api/v1/contacts/${id}/owner-history`),
      mgrB.put(`/api/v1/contacts/${id}/labels`, { labelIds: [] }),
      mgrB.post(`/api/v1/contacts/${id}/block`),
      mgrB.delete(`/api/v1/contacts/${id}/block`),
      mgrB.get(`/api/v1/contacts/${id}/calls`),
      mgrB.post(`/api/v1/contacts/${id}/call-permission-request`)
    ]);
    for (const r of res) expect(r.status).toBe(404);
    // A manager of A cannot hand a customer to B's staff.
    expect((await mgrA.put(`/api/v1/contacts/${id}/owner`, { ownerUserId: b.staff[0].id })).status).toBe(404);
    const [row] = await db().select().from(contacts).where(eq(contacts.id, id));
    expect(row.name).toBe('Private');
  });

  it('updates, blocks and unblocks', async () => {
    const c = await s0.post('/api/v1/contacts', { name: 'Edit Me', phone: '+94776000002' });
    const upd = await s0.patch(`/api/v1/contacts/${c.body.id}`, { notes: 'Wants blue', marketingOptIn: true });
    expect(upd.body).toMatchObject({ notes: 'Wants blue', marketingOptIn: true });
    expect((await s0.post(`/api/v1/contacts/${c.body.id}/block`)).body.blocked).toBe(true);
    expect((await s0.delete(`/api/v1/contacts/${c.body.id}/block`)).body.blocked).toBe(false);
  });

  it('imports rows and reports what happened to each', async () => {
    const res = await mgrA.post('/api/v1/contacts/import', {
      rows: [
        { name: 'Imported One', phone: '0778000001', ownerEmail: a.staff[0].email, labels: ['Imported'] },
        { name: 'Imported One', phone: '+94778000001' },
        { name: 'Amal Fernando', phone: '+94771234567', city: 'Galle' },
        { name: 'Edit Me', phone: '+94776000002' },
        { name: 'Nobody Owns', phone: '+94778000003', ownerEmail: 'nobody@test.local' },
        { name: 'Too short', phone: '+1234567' }
      ]
    });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.updated).toBe(1);
    expect(res.body.skipped).toBe(2);
    expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([5, 6]);
    const list = await mgrA.get('/api/v1/contacts?search=8000001');
    expect(list.body.items[0]).toMatchObject({ name: 'Imported One', ownerUserId: a.staff[0].id });
    expect(list.body.items[0].labels[0].name).toBe('Imported');
    expect((await mgrA.get('/api/v1/contacts?search=Amal')).body.items[0].city).toBe('Galle');
    expect((await s0.post('/api/v1/contacts/import', { rows: [{ name: 'X', phone: '+94779999999' }] })).status).toBe(403);
  });

  it('lists a customer’s calls', async () => {
    const c = await mgrA.post('/api/v1/contacts', { name: 'Caller', phone: '+94776100001' });
    await db()
      .insert(calls)
      .values({ companyId: a.id, contactId: c.body.id, direction: 'in', outcome: 'answered', handledByUserId: a.staff[0].id, durationSeconds: 42 });
    const res = await mgrA.get(`/api/v1/contacts/${c.body.id}/calls`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      direction: 'in',
      outcome: 'answered',
      handledBy: { userId: a.staff[0].id, name: a.staff[0].name },
      durationSeconds: 42,
      hasRecording: false,
      recordingUrl: null
    });
    expect(res.body[0].contact.name).toBe('Caller');
  });

  it('sends the call permission request within Meta limits', async () => {
    const c = await s0.post('/api/v1/contacts', { name: 'Call Me', phone: '+94776200001' });
    const id = c.body.id as string;
    const closed = await s0.post(`/api/v1/contacts/${id}/call-permission-request`);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('WINDOW_CLOSED');
    expect(closed.body.error.message).toBe('Outside the 24-hour window. Send the call_permission template instead.');

    await db()
      .update(conversations)
      .set({ windowExpiresAt: new Date(Date.now() + 3600_000), lastMessageAt: new Date(), lastInboundAt: new Date() })
      .where(eq(conversations.contactId, id));
    const ok = await s0.post(`/api/v1/contacts/${id}/call-permission-request`);
    expect(ok.status).toBe(200);
    expect(ok.body.callPermission.status).toBe('requested');
    const conv = await db().select().from(conversations).where(eq(conversations.contactId, id));
    const sent = await db().select().from(messages).where(eq(messages.conversationId, conv[0].id));
    expect(sent.some(m => m.type === 'interactive' && m.body === 'Can we call you on WhatsApp about your enquiry?')).toBe(true);

    const again = await s0.post(`/api/v1/contacts/${id}/call-permission-request`);
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('CALL_PERMISSION_LIMIT');

    // Two in the last 7 days (none in 24h) is also the limit.
    const old = [new Date(Date.now() - 3 * 86400_000).toISOString(), new Date(Date.now() - 2 * 86400_000).toISOString()];
    await db().update(contacts).set({ callPermissionRequests: old }).where(eq(contacts.id, id));
    const weekly = await s0.post(`/api/v1/contacts/${id}/call-permission-request`);
    expect(weekly.status).toBe(429);
    expect(weekly.body.error.message).toContain('twice in 7 days');

    // Old entries are pruned, and permission already granted is a conflict.
    await db().update(contacts).set({ callPermissionRequests: [new Date(Date.now() - 8 * 86400_000).toISOString()], callPermission: 'permanent' }).where(eq(contacts.id, id));
    expect((await s0.post(`/api/v1/contacts/${id}/call-permission-request`)).status).toBe(409);

    // Staff without the calling switch are refused.
    await mgrA.patch(`/api/v1/staff/${a.staff[0].id}`, { permissions: { makeCalls: false } });
    expect((await s0.post(`/api/v1/contacts/${id}/call-permission-request`)).status).toBe(403);
    await mgrA.patch(`/api/v1/staff/${a.staff[0].id}`, { permissions: { makeCalls: true } });
  });
});
