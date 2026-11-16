/**
 * Test helpers: boot the API in-process against the test database, create companies and
 * users directly, and sign in through the real login endpoint.
 */
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../src/worker/worker.module';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { initialsOf } from '@smart-reply/shared';
import { createApp } from '../src/main';
import { DB } from '../src/infra/db';
import type { Db } from '../src/db/client';
import { companies, presence, users, whatsappAccounts } from '../src/db/schema';
import { encrypt } from '../src/common/crypto';
import { RateLimiter } from '../src/infra/rate-limit';

let app: INestApplication | null = null;
let worker: INestApplicationContext | null = null;
let passwordHash: string | null = null;
export const PASSWORD = 'TestPass123!';

export async function getApp(): Promise<INestApplication> {
  if (app) return app;
  const a = await createApp();
  await a.init();
  app = a;
  return a;
}

/** The worker's services (webhook processor, engines) for calling job handlers directly. */
export async function getWorker(): Promise<INestApplicationContext> {
  if (worker) return worker;
  worker = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error'] });
  return worker;
}

export async function closeApp(): Promise<void> {
  if (worker) await worker.close();
  worker = null;
  if (app) await app.close();
  app = null;
}

export function db(): Db {
  if (!app) throw new Error('Call getApp() first');
  return app.get<Db>(DB);
}

function uniq(): string {
  return uuidv7().slice(-12);
}

export interface TestCompany {
  id: string;
  manager: TestUser;
  staff: TestUser[];
}
export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: 'manager' | 'staff' | 'system_admin';
}

async function pw(): Promise<string> {
  passwordHash ??= await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  return passwordHash;
}

export async function createUser(companyId: string | null, role: TestUser['role'], name?: string): Promise<TestUser> {
  const n = name ?? `${role} ${uniq()}`;
  const email = `${role}.${uniq()}@test.local`;
  const [u] = await db()
    .insert(users)
    .values({ companyId, role, name: n, initials: initialsOf(n), email, passwordHash: await pw(), status: 'active', title: role })
    .returning();
  if (companyId) {
    for (const channel of ['call', 'chat'] as const) {
      await db().insert(presence).values({ userId: u.id, channel, companyId, status: 'available' }).onConflictDoNothing();
    }
  }
  return { id: u.id, email, name: n, role };
}

/** A company with a manager and `staffCount` staff. Optionally a connected WhatsApp number. */
export async function createCompany(opts: { staffCount?: number; seatLimit?: number; whatsapp?: boolean } = {}): Promise<TestCompany> {
  const slug = `co-${uniq()}`;
  const [c] = await db()
    .insert(companies)
    .values({ name: `Company ${slug}`, slug, seatLimit: opts.seatLimit ?? 10 })
    .returning();
  const manager = await createUser(c.id, 'manager');
  const staff: TestUser[] = [];
  for (let i = 0; i < (opts.staffCount ?? 1); i++) staff.push(await createUser(c.id, 'staff'));
  if (opts.whatsapp) {
    await db()
      .insert(whatsappAccounts)
      .values({
        companyId: c.id,
        wabaId: String(Date.now()) + Math.floor(Math.random() * 1000),
        phoneNumberId: String(Date.now()) + Math.floor(Math.random() * 100000),
        displayPhone: '+94 77 000 0000',
        accessTokenEnc: encrypt('test-token-test-token-test-token'),
        connectMethod: 'manual',
        status: 'connected'
      });
  }
  return { id: c.id, manager, staff };
}

/** A supertest agent signed in as the user (cookie session, with the CSRF header). */
export async function signIn(user: TestUser): Promise<Agent> {
  const a = await getApp();
  const agent = request.agent(a.getHttpServer());
  // Tests sign in far more often than a person; keep the per-IP login limit out of the way.
  await a.get(RateLimiter).reset('login:ip:::ffff:127.0.0.1');
  await a.get(RateLimiter).reset('login:ip:::1');
  await a.get(RateLimiter).reset('login:ip:127.0.0.1');
  const res = await agent.post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  return wrap(agent);
}

type SuperAgent = ReturnType<typeof request.agent>;
export interface Agent {
  get(url: string): request.Test;
  post(url: string, body?: object): request.Test;
  put(url: string, body?: object): request.Test;
  patch(url: string, body?: object): request.Test;
  delete(url: string): request.Test;
}

function wrap(agent: SuperAgent): Agent {
  const h = { 'x-sr-client': 'web' };
  return {
    get: url => agent.get(url).set(h),
    post: (url, body) => agent.post(url).set(h).send(body ?? {}),
    put: (url, body) => agent.put(url).set(h).send(body ?? {}),
    patch: (url, body) => agent.patch(url).set(h).send(body ?? {}),
    delete: url => agent.delete(url).set(h)
  };
}
