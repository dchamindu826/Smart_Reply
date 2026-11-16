import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export function createPool(url: string, max = 10): Pool {
  return new Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export { schema };
