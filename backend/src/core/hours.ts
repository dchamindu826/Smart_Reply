import type { CallHours } from '@smart-reply/shared';

export const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

/** Local date parts in a time zone. */
export function localParts(at: Date, timeZone: string): { day: (typeof DAYS)[number]; hhmm: string; date: string } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(f.formatToParts(at).map(p => [p.type, p.value]));
  return {
    day: String(parts.weekday).toUpperCase() as (typeof DAYS)[number],
    hhmm: `${parts.hour}${parts.minute}`,
    date: `${parts.year}-${parts.month}-${parts.day}`
  };
}

/**
 * Whether the business is open now. With hours turned off the business counts as always open.
 * A holiday without times is closed all day.
 */
export function isOpen(hours: CallHours, at = new Date()): boolean {
  if (!hours.enabled) return true;
  const { day, hhmm, date } = localParts(at, hours.timezone || 'Asia/Colombo');
  const holiday = hours.holidays.find(h => h.date === date);
  if (holiday) return Boolean(holiday.open && holiday.close && hhmm >= holiday.open && hhmm < holiday.close);
  return hours.weekly.some(w => w.day === day && hhmm >= w.open && hhmm < w.close);
}
