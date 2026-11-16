import { WINDOW_HOURS } from '@smart-reply/shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days between two times in local time (b - a). */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86_400_000);
}

export function isSameDay(a: string, b: string): boolean {
  return dayDiff(new Date(a), new Date(b)) === 0;
}

/** `14:05` in local time. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Chat list time: `14:05`, `Yesterday`, `Tue`, or `03/11/26`. */
export function listTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = dayDiff(d, now);
  if (diff <= 0) return clockTime(iso);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return DAYS[d.getDay()] ?? '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

/** Separator in a chat thread: `Today`, `Yesterday`, `Mon, 3 Nov 2026`. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `3 Nov, 14:05` */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clockTime(iso)}`;
}

/** `0:42`, `12:03`, `1:02:03` */
export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** `1h 23m`, `12m`, `<1m` */
export function countdown(ms: number): string {
  if (ms < 60_000) return '<1m';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Average reply time: `45s`, `3m`, `1h 5m`, or `—` when unknown. */
export function replySeconds(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/** `2h 10m` for a number of minutes. */
export function minutesLabel(min: number): string {
  if (min < 60) return `${Math.max(0, Math.round(min))}m`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

export interface WindowState {
  /** The customer can receive free-form messages. */
  open: boolean;
  msLeft: number;
  /** Less than two hours left: show the countdown. */
  closingSoon: boolean;
  label: string;
}

const CLOSING_SOON_MS = 2 * 3_600_000;

/** WhatsApp's 24-hour customer service window. `null` means the customer never wrote. */
export function windowState(windowExpiresAt: string | null, now: number = Date.now()): WindowState {
  if (!windowExpiresAt) return { open: false, msLeft: 0, closingSoon: false, label: 'Template only' };
  const exp = Date.parse(windowExpiresAt);
  const msLeft = Number.isFinite(exp) ? exp - now : 0;
  if (msLeft <= 0) return { open: false, msLeft: 0, closingSoon: false, label: 'Window closed' };
  const ms = Math.min(msLeft, WINDOW_HOURS * 3_600_000);
  return { open: true, msLeft: ms, closingSoon: ms < CLOSING_SOON_MS, label: `${countdown(ms)} left` };
}
