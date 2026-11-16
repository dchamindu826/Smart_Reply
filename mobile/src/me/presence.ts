import type { ChannelPresence, PresenceStatus } from '@smart-reply/shared';
import type { Palette } from '@/ui/theme';

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  available: 'Available',
  oncall: 'On a call',
  brk: 'On a break',
  away: 'Away',
  dnd: 'Do not disturb'
};

export const BREAK_REASONS = ['Tea', 'Lunch', 'Prayer', 'Meeting', 'Other'] as const;
export const PLANNED_MINUTES = [10, 15, 30, 45, 60] as const;

export function statusColor(s: PresenceStatus, t: Palette): string {
  switch (s) {
    case 'available':
      return t.ok;
    case 'oncall':
      return t.info;
    case 'brk':
      return t.warn;
    case 'away':
      return t.text3;
    case 'dnd':
      return t.bad;
  }
}

/** `On a break · Lunch · 12m of 30m` */
export function presenceText(p: ChannelPresence | undefined, now: number = Date.now()): string {
  if (!p) return 'Unknown';
  const parts: string[] = [STATUS_LABEL[p.status]];
  if (p.reason) parts.push(p.reason);
  if (p.status !== 'available') {
    const since = Date.parse(p.since);
    if (Number.isFinite(since)) {
      const min = Math.max(0, Math.floor((now - since) / 60_000));
      parts.push(p.plannedMinutes ? `${min}m of ${p.plannedMinutes}m` : `${min}m`);
    }
  }
  return parts.join(' · ');
}
