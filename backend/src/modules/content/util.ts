/** Small helpers shared by the content services. */

/** Postgres unique violation (23505), also when Drizzle wraps the driver error. */
export function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === 'object'; i++) {
    if ((e as { code?: unknown }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Escape `%` and `_` for ILIKE. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, c => `\\${c}`)}%`;
}

export function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
