/** Day and week boundaries in a company's time zone (stats "today", break log, "this week"). */

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Milliseconds the zone is ahead of UTC at `at`. */
function offsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` of `at` in the zone. */
export function localDate(timeZone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: safeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The instant a local calendar day starts in the zone. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const tz = safeZone(timeZone);
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = offsetMs(tz, new Date(guess));
  let t = guess - first;
  const second = offsetMs(tz, new Date(t));
  if (second !== first) t = guess - second;
  return new Date(t);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Start and end of a local day. */
export function dayRange(timeZone: string, date = localDate(timeZone)): { date: string; from: Date; to: Date } {
  return { date, from: startOfLocalDay(date, timeZone), to: startOfLocalDay(addDays(date, 1), timeZone) };
}

/** Start of the local week (Monday). */
export function startOfLocalWeek(timeZone: string, at = new Date()): Date {
  const today = localDate(timeZone, at);
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return startOfLocalDay(addDays(today, -((dow + 6) % 7)), timeZone);
}
