import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import { maskSecret } from '@smart-reply/shared';
import { closeApp, createCompany, createUser, db, getApp, signIn, Agent, TestCompany, TestUser } from './helpers';
import { decrypt } from '../src/common/crypto';
import {
  aiAddons,
  aiBotSettings,
  assignmentRules,
  auditLogs,
  businessProfiles,
  callSettings,
  companies,
  connectLinks,
  invites,
  ivrMenus,
  rolePermissions,
  users,
  whatsappAccounts
} from '../src/db/schema';

const RAW_TOKEN = 'EAAG-manual-token-1234567890-abcdef';
const ES_TOKEN = 'EAAG-embedded-token-0987654321-zyxw';

/** Meta stub: subscribe/register succeed, phone number read returns details, code exchange gives a token. */
function stubMeta(): { calls: { method: string; url: string }[] } {
  const calls: { method: string; url: string }[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://meta.test')) return real(input, init);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    const u = new URL(url);
    if (u.pathname.endsWith('/oauth/access_token')) return new Response(JSON.stringify({ access_token: ES_TOKEN }), { status: 200 });
    if (method === 'GET' && /\/\d+$/.test(u.pathname)) {
      return new Response(
        JSON.stringify({
          id: u.pathname.split('/').pop(),
          display_phone_number: '+94 77 555 1234',
          verified_name: 'Test Shop',
          name_status: 'APPROVED',
          quality_rating: 'GREEN',
          whatsapp_business_manager_messaging_limit: 'TIER_1K'
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  return { calls };
}

const uniqDigits = (): string => String(Date.now()) + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');

describe('system admin', () => {
  let admin: TestUser;
  let adm: Agent;
  let co: TestCompany;
  let mgr: Agent;
  let staff: Agent;

  beforeAll(async () => {
    const redis = new IORedis(process.env.REDIS_URL!);
    await redis.flushdb();
    redis.disconnect();
    await getApp();
    admin = await createUser(null, 'system_admin');
    adm = await signIn(admin);
    co = await createCompany({ staffCount: 1 });
    mgr = await signIn(co.manager);
    staff = await signIn(co.staff[0]);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeApp();
  });

  it('lets only system admins reach /admin', async () => {
    for (const path of ['/api/v1/admin/companies', '/api/v1/admin/plans', '/api/v1/admin/platform/meta', '/api/v1/admin/ai/companies', '/api/v1/admin/health']) {
      expect((await mgr.get(path)).status).toBe(403);
      expect((await staff.get(path)).status).toBe(403);
    }
    expect((await mgr.post('/api/v1/admin/companies', { name: 'X', manager: { name: 'Y', email: 'y@test.local' } })).status).toBe(403);
    expect((await mgr.put(`/api/v1/admin/companies/${co.id}/whatsapp`, {})).status).toBe(403);
    const list = await adm.get('/api/v1/admin/companies');
    expect(list.status).toBe(200);
    const row = list.body.find((c: { id: string }) => c.id === co.id);
    expect(row.seatsUsed).toBe(2);
    expect(row.managerEmail).toBe(co.manager.email);
    expect(row.aiStatus).toBe('off');
  });

  it('creates a company with its manager and default rows', async () => {
    const plan = await adm.post('/api/v1/admin/plans', { name: 'Growth', seatLimit: 15, priceMinor: 990000 });
    expect(plan.status).toBe(201);
    const email = `owner.${uniqDigits()}@test.local`;
    const res = await adm.post('/api/v1/admin/companies', {
      name: 'Lanka Spice Traders',
      planId: plan.body.id,
      manager: { name: 'Nimal Silva', email, password: 'StrongPass123' }
    });
    expect(res.status).toBe(201);
    const c = res.body.company;
    expect(c.seatLimit).toBe(15);
    expect(c.planName).toBe('Growth');
    expect(c.managerName).toBe('Nimal Silva');
    expect(c.seatsUsed).toBe(1);
    expect(res.body.managerInviteLink).toBeUndefined();
    const [u] = await db().select().from(users).where(eq(users.email, email));
    expect(u.role).toBe('manager');
    expect(u.status).toBe('active');
    expect(u.companyId).toBe(c.id);
    for (const t of [rolePermissions, callSettings, assignmentRules, businessProfiles, ivrMenus, aiAddons, aiBotSettings]) {
      expect(await db().select().from(t).where(eq(t.companyId, c.id))).toHaveLength(1);
    }
    const [bp] = await db().select().from(businessProfiles).where(eq(businessProfiles.companyId, c.id));
    expect(bp.displayName).toBe('Lanka Spice Traders');

    // Same name again: slug gets a suffix. No password: an invite link.
    const again = await adm.post('/api/v1/admin/companies', { name: 'Lanka Spice Traders', manager: { name: 'Kamala', email: `k.${uniqDigits()}@test.local` } });
    expect(again.status).toBe(201);
    expect(again.body.company.slug).toBe(`${c.slug}-2`);
    expect(again.body.managerInviteLink).toMatch(/\/invite\//);
    expect(await db().select().from(invites).where(eq(invites.companyId, again.body.company.id))).toHaveLength(1);
    expect(again.body.company.seatsUsed).toBe(1);

    const audit = await db().select().from(auditLogs).where(eq(auditLogs.companyId, c.id));
    expect(audit.some(a => a.actorName === 'LUMI AI support')).toBe(true);

    const dup = await adm.post('/api/v1/admin/companies', { name: 'Other', manager: { name: 'N', email } });
    expect(dup.status).toBe(409);
  });

  it('keeps seat limits between seats in use and 100', async () => {
    const tooMany = await adm.post('/api/v1/admin/companies', { name: 'Big Co', seatLimit: 101, manager: { name: 'A', email: `a.${uniqDigits()}@test.local` } });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe('VALIDATION_FAILED');
    expect((await adm.patch(`/api/v1/admin/companies/${co.id}`, { seatLimit: 101 })).status).toBe(400);
    const below = await adm.patch(`/api/v1/admin/companies/${co.id}`, { seatLimit: 1 });
    expect(below.status).toBe(409);
    const ok = await adm.patch(`/api/v1/admin/companies/${co.id}`, { seatLimit: 100 });
    expect(ok.status).toBe(200);
    expect(ok.body.seatLimit).toBe(100);
  });

  it('stores a manually entered WhatsApp token encrypted and shows it masked', async () => {
    const meta = stubMeta();
    const wabaId = uniqDigits();
    const phoneNumberId = uniqDigits();
    const res = await adm.put(`/api/v1/admin/companies/${co.id}/whatsapp`, { wabaId, phoneNumberId, accessToken: RAW_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.account.connected).toBe(true);
    expect(res.body.account.displayPhone).toBe('+94 77 555 1234');
    expect(res.body.account.connectMethod).toBe('manual');
    expect(res.body.account.tokenMasked).toBe(maskSecret(RAW_TOKEN));
    expect(JSON.stringify(res.body)).not.toContain(RAW_TOKEN);
    expect(meta.calls.some(c => c.method === 'POST' && c.url.includes(`${wabaId}/subscribed_apps`))).toBe(true);
    expect(meta.calls.some(c => c.url.includes('/register'))).toBe(false);

    const [row] = await db().select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, co.id));
    expect(row.accessTokenEnc).not.toContain(RAW_TOKEN);
    expect(decrypt(row.accessTokenEnc)).toBe(RAW_TOKEN);
    expect(row.webhookSubscribedAt).toBeTruthy();

    const view = await adm.get(`/api/v1/admin/companies/${co.id}/whatsapp`);
    expect(view.body.tokenMasked).toBe(maskSecret(RAW_TOKEN));
    expect(view.body.qualityRating).toBe('GREEN');

    // The same number cannot be connected to another company.
    const other = await createCompany({ staffCount: 0 });
    const clash = await adm.put(`/api/v1/admin/companies/${other.id}/whatsapp`, { wabaId, phoneNumberId, accessToken: RAW_TOKEN });
    expect(clash.status).toBe(409);

    const off = await adm.post(`/api/v1/admin/companies/${co.id}/whatsapp/disconnect`);
    expect(off.status).toBe(200);
    expect(off.body.status).toBe('disconnected');
  });

  it('saves platform Meta settings with masked secrets', async () => {
    const res = await adm.put('/api/v1/admin/platform/meta', {
      appId: '123456789012',
      appSecret: 'app-secret-value-123456',
      graphVersion: 'v26.0',
      verifyToken: 'verify-token-123456',
      embeddedSignupConfigId: '998877'
    });
    expect(res.status).toBe(200);
    expect(res.body.appSecretMasked).toBe(maskSecret('app-secret-value-123456'));
    expect(JSON.stringify(res.body)).not.toContain('app-secret-value-123456');
    expect(res.body.callbackUrl).toBe('http://localhost:4999/api/v1/webhooks/whatsapp');
    // Leaving the secret out keeps it.
    const keep = await adm.put('/api/v1/admin/platform/meta', { appId: '123456789012', graphVersion: 'v26.0', embeddedSignupConfigId: '998877' });
    expect(keep.body.appSecretMasked).toBe(maskSecret('app-secret-value-123456'));
    const wh = await adm.get('/api/v1/admin/platform/webhook');
    expect(wh.body.verifyTokenMasked).toBe(maskSecret('verify-token-123456'));
    expect(wh.body.subscribedFields).toContain('messages');
    const test = await adm.post('/api/v1/admin/platform/webhook/test');
    expect(test.body).toEqual({ ok: true, stored: 1 });
    const events = await adm.get('/api/v1/admin/webhook-events?status=pending');
    expect(events.status).toBe(200);
    expect(events.body[0].field).toBe('test');
    expect(events.body[0]).not.toHaveProperty('payload');
  });

  it('connect link opens Embedded Signup once', async () => {
    stubMeta();
    const target = await createCompany({ staffCount: 0 });
    const link = await adm.post(`/api/v1/admin/companies/${target.id}/whatsapp/connect-link`);
    expect(link.status).toBe(201);
    const token = decodeURIComponent(String(link.body.url).split('/connect/')[1]);
    const [stored] = await db().select().from(connectLinks).where(eq(connectLinks.companyId, target.id));
    expect(stored.tokenHash).not.toBe(token);

    const app = await getApp();
    const request = (await import('supertest')).default;
    const cfg = await request(app.getHttpServer()).get(`/api/v1/connect-links/${token}`);
    expect(cfg.status).toBe(200);
    expect(cfg.body).toEqual({ appId: '123456789012', configId: '998877', graphVersion: 'v26.0', companyName: expect.any(String) });

    const body = { code: 'code-from-meta-popup-123', wabaId: uniqDigits(), phoneNumberId: uniqDigits() };
    const done = await request(app.getHttpServer()).post(`/api/v1/connect-links/${token}/finish`).send(body);
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ ok: true, displayPhone: '+94 77 555 1234' });
    const [acc] = await db().select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, target.id));
    expect(acc.connectMethod).toBe('embedded_signup');
    expect(decrypt(acc.accessTokenEnc)).toBe(ES_TOKEN);

    const twice = await request(app.getHttpServer()).post(`/api/v1/connect-links/${token}/finish`).send(body);
    expect(twice.status).toBe(401);
    expect(twice.body.error.code).toBe('TOKEN_INVALID');
    expect((await request(app.getHttpServer()).get(`/api/v1/connect-links/${token}`)).status).toBe(401);
  });

  it('opens a support session as the company manager', async () => {
    const support = await signIn(admin);
    const res = await support.post(`/api/v1/admin/companies/${co.id}/impersonate`, { reason: 'Customer asked for help with labels' });
    expect(res.status).toBe(200);
    expect(res.body.me.company.id).toBe(co.id);
    expect(res.body.me.impersonation.reason).toBe('Customer asked for help with labels');
    expect(res.body.me.user.id).toBe(co.manager.id);
  });

  it('suspends and reactivates a company', async () => {
    const target = await createCompany({ staffCount: 0 });
    const m = await signIn(target.manager);
    expect((await adm.post(`/api/v1/admin/companies/${target.id}/suspend`)).body.status).toBe('suspended');
    await new Promise(r => setTimeout(r, 50));
    const [c] = await db().select().from(companies).where(eq(companies.id, target.id));
    expect(c.status).toBe('suspended');
    expect((await m.get('/api/v1/me')).status).toBe(403);
    expect((await adm.post(`/api/v1/admin/companies/${target.id}/activate`)).body.status).toBe('active');
  });

  it('reports usage, health and the platform audit', async () => {
    const usage = await adm.get('/api/v1/admin/usage');
    expect(usage.status).toBe(200);
    expect(usage.body.find((r: { companyId: string }) => r.companyId === co.id)).toBeTruthy();
    const health = await adm.get('/api/v1/admin/health');
    expect(health.status).toBe(200);
    expect(health.body.queues.map((q: { name: string }) => q.name)).toContain('ai');
    const audit = await adm.get('/api/v1/admin/audit');
    expect(audit.status).toBe(200);
    expect(audit.body.length).toBeGreaterThan(0);
    expect(audit.body.some((a: { actorName: string }) => a.actorName.startsWith('LUMI AI support ('))).toBe(true);
  });
});
