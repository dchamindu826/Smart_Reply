import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeApp, createCompany, createUser, getApp, PASSWORD, signIn, TestCompany } from './helpers';

describe('auth', () => {
  let co: TestCompany;
  beforeAll(async () => {
    await getApp();
    co = await createCompany({ staffCount: 1 });
  });
  afterAll(closeApp);

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const app = await getApp();
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: co.manager.email, password: 'nope-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('signs in with cookies and returns me', async () => {
    const a = await signIn(co.manager);
    const me = await a.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('manager');
    expect(me.body.company.id).toBe(co.id);
  });

  it('gives mobile clients bearer tokens and rotates refresh tokens', async () => {
    const app = await getApp();
    const http = app.getHttpServer();
    const login = await request(http).post('/api/v1/auth/login').send({ email: co.staff[0].email, password: PASSWORD, client: 'mobile' });
    expect(login.status).toBe(200);
    const { accessToken, refreshToken } = login.body.tokens;
    const me = await request(http).get('/api/v1/me').set('authorization', `Bearer ${accessToken}`);
    expect(me.body.user.role).toBe('staff');
    const r1 = await request(http).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(r1.status).toBe(200);
    // Using the old refresh token again is refused and ends the family.
    const r2 = await request(http).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(r2.status).toBe(401);
    const r3 = await request(http).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.tokens.refreshToken });
    expect(r3.status).toBe(401);
  });

  it('blocks cookie writes without the client header (CSRF)', async () => {
    const app = await getApp();
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/login').send({ email: co.manager.email, password: PASSWORD });
    const res = await agent.patch('/api/v1/me').send({ title: 'x' });
    expect(res.status).toBe(403);
  });

  it('keeps system admins out of company routes', async () => {
    const admin = await createUser(null, 'system_admin');
    const a = await signIn(admin);
    const res = await a.get('/api/v1/conversations');
    expect(res.status).toBe(403);
  });
});
