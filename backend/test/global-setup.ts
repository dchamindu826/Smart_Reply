import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import IORedis from 'ioredis';

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://smart:smart@localhost:5432/smart_reply_test';
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  await pool.end();
  // Fresh Redis database: clears rate-limit counters and old queue jobs between runs.
  const redis = new IORedis(process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1');
  await redis.flushdb();
  redis.disconnect();
}
