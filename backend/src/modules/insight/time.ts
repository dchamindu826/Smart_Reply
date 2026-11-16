/**
 * Day, week and month boundaries in the company's timezone. Every "today" or "this week" on
 * the insight screens means the company's local calendar, not UTC.
 */
import type { RangeQuery } from '@smart-reply/shared';
import { AppError } from '../../common/errors';

export const DEFAULT_TZ = 'Asia/Colombo';
const DAY_MS = 86_400_000;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    formatters.set(tz, f);
  }
  return f;
}

/** A timezone name Intl accepts, or the default. */
export function safeTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    formatter(tz);
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

export function localParts(at: Date, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(at)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function offsetMs(at: Date, tz: string): number {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant when the local wall clock reads `y-m-d 00:00` in the zone. */
export function zonedMidnight(year: number, month: number, day: number, tz: string): Date {
  const wall = Date.UTC(year, month - 1, day);
  let guess = wall - offsetMs(new Date(wall), tz);
  // A second pass settles days where the offset changes (daylight saving).
  guess = wall - offsetMs(new Date(guess), tz);
  return new Date(guess);
}

export function startOfLocalDay(at: Date, tz: string): Date {
  const p = localParts(at, tz);
  return zonedMidnight(p.year, p.month, p.day, tz);
}

/** Midnight `days` local days after the local day of `at` (negative goes back). */
export function addLocalDays(at: Date, days: number, tz: string): Date {
  const p = localParts(at, tz);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day) + days * DAY_MS);
  return zonedMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), tz);
}

/** Monday 00:00 local of the week that contains `at`. */
export function startOfLocalWeek(at: Date, tz: string): Date {
  const p = localParts(at, tz);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sunday
  const back = (weekday + 6) % 7;
  return addLocalDays(at, -back, tz);
}

export function startOfLocalMonth(at: Date, tz: string): Date {
  const p = localParts(at, tz);
  return zonedMidnight(p.year, p.month, 1, tz);
}

/** `YYYY-MM-DD` of the local day. */
export function localDate(at: Date, tz: string): string {
  const p = localParts(at, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function localMonth(at: Date, tz: string): string {
  return localDate(at, tz).slice(0, 7);
}

export interface Window {
  from: Date;
  to: Date;
}

export function today(tz: string, now = new Date()): Window {
  return { from: startOfLocalDay(now, tz), to: addLocalDays(now, 1, tz) };
}

export function thisWeek(tz: string, now = new Date()): Window {
  const from = startOfLocalWeek(now, tz);
  return { from, to: addLocalDays(from, 7, tz) };
}

const MAX_RANGE_DAYS = 366;

/** `today`, `7d` and `30d` include today; `month` is the current local month; `custom` takes `from`/`to`. */
export function resolveRange(q: Pick<RangeQuery, 'range' | 'from' | 'to'>, tz: string, now = new Date()): Window {
  switch (q.range) {
    case 'today':
      return today(tz, now);
    case '30d':
      return { from: addLocalDays(now, -29, tz), to: addLocalDays(now, 1, tz) };
    case 'month':
      return { from: startOfLocalMonth(now, tz), to: addLocalDays(now, 1, tz) };
    case 'custom': {
      if (!q.from || !q.to) throw new AppError('VALIDATION_FAILED', 'Choose a start and an end date.');
      const from = new Date(q.from);
      const to = new Date(q.to);
      if (!(from < to)) throw new AppError('VALIDATION_FAILED', 'The end must be after the start.');
      if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) throw new AppError('VALIDATION_FAILED', 'Choose a range of one year or less.');
      return { from, to };
    }
    case '7d':
    default:
      return { from: addLocalDays(now, -6, tz), to: addLocalDays(now, 1, tz) };
  }
}

/** Every local date from `from` up to (not including) `to`. */
export function localDates(w: Window, tz: string): string[] {
  const out: string[] = [];
  let cursor = startOfLocalDay(w.from, tz);
  for (let i = 0; i < MAX_RANGE_DAYS + 2 && cursor < w.to; i++) {
    out.push(localDate(cursor, tz));
    cursor = addLocalDays(cursor, 1, tz);
  }
  return out;
}
