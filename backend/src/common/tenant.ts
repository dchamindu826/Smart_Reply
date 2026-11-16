/**
 * Company-scoped data access. Every query on business data goes through these helpers or
 * adds `eq(table.companyId, session.companyId)` itself. A row from another company is
 * reported as "not found" (404), never as "forbidden".
 */
import { and, eq, SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../db/client';
import { notFound } from './errors';

interface ScopedTable {
  id: PgColumn;
  companyId: PgColumn;
}

/** `where` condition for one company's rows, plus any extra conditions. */
export function inCompany<T extends { companyId: PgColumn }>(table: T, companyId: string, ...extra: (SQL | undefined)[]): SQL {
  return and(eq(table.companyId, companyId), ...extra) as SQL;
}

/** Load one row by id inside the company, or throw NOT_FOUND. */
export async function findOwned<T extends PgTable & ScopedTable>(
  db: DbOrTx,
  table: T,
  companyId: string,
  id: string,
  what = 'Item'
): Promise<T['$inferSelect']> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound(what);
  const rows = (await db
    .select()
    .from(table as PgTable)
    .where(and(eq(table.id, id), eq(table.companyId, companyId)))
    .limit(1)) as T['$inferSelect'][];
  if (!rows[0]) throw notFound(what);
  return rows[0];
}
