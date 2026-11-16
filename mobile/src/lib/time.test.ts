import { countdown, dayLabel, duration, listTime, replySeconds, windowState } from './time';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('listTime', () => {
  const now = at(2026, 11, 16, 15, 0);
  it('shows the clock for today', () => expect(listTime(at(2026, 11, 16, 9, 5).toISOString(), now)).toBe('09:05'));
  it('shows Yesterday', () => expect(listTime(at(2026, 11, 15, 23, 59).toISOString(), now)).toBe('Yesterday'));
  it('shows the weekday within a week', () => expect(listTime(at(2026, 11, 12).toISOString(), now)).toBe('Thu'));
  it('shows the date for older', () => expect(listTime(at(2026, 10, 3).toISOString(), now)).toBe('03/10/26'));
  it('is empty for null', () => expect(listTime(null, now)).toBe(''));
});

describe('dayLabel', () => {
  const now = at(2026, 11, 16);
  it('labels today and yesterday', () => {
    expect(dayLabel(at(2026, 11, 16, 1).toISOString(), now)).toBe('Today');
    expect(dayLabel(at(2026, 11, 15, 1).toISOString(), now)).toBe('Yesterday');
  });
  it('labels older days in full', () => expect(dayLabel(at(2026, 11, 3).toISOString(), now)).toBe('Tue, 3 Nov 2026'));
});

describe('durations', () => {
  it('formats call length', () => {
    expect(duration(42)).toBe('0:42');
    expect(duration(723)).toBe('12:03');
    expect(duration(3723)).toBe('1:02:03');
    expect(duration(null)).toBe('0:00');
  });
  it('formats countdowns', () => {
    expect(countdown(30_000)).toBe('<1m');
    expect(countdown(12 * 60_000)).toBe('12m');
    expect(countdown(83 * 60_000)).toBe('1h 23m');
  });
  it('formats reply times', () => {
    expect(replySeconds(null)).toBe('—');
    expect(replySeconds(45)).toBe('45s');
    expect(replySeconds(180)).toBe('3m');
    expect(replySeconds(3900)).toBe('1h 5m');
  });
});

describe('windowState', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  it('is closed when the customer never wrote', () => {
    expect(windowState(null, now)).toMatchObject({ open: false, closingSoon: false });
  });
  it('is closed after expiry', () => {
    expect(windowState('2026-11-16T09:59:00Z', now)).toMatchObject({ open: false, label: 'Window closed' });
  });
  it('is open without a countdown when plenty of time is left', () => {
    expect(windowState('2026-11-17T08:00:00Z', now)).toMatchObject({ open: true, closingSoon: false, label: '22h 0m left' });
  });
  it('shows the countdown under two hours', () => {
    expect(windowState('2026-11-16T11:23:00Z', now)).toMatchObject({ open: true, closingSoon: true, label: '1h 23m left' });
  });
});
