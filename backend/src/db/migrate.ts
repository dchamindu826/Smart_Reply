/** Applies the SQL migrations in `backend/drizzle`. Run on every deploy before the API starts. */
import 'dotenv/config';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from './client';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = createPool(url, 1);
  const db = createDb(pool);
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log('Migrations applied.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
