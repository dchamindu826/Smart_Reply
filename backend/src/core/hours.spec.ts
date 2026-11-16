import { describe, expect, it } from 'vitest';
import { isOpen } from './hours';

const hours = {
  enabled: true,
  timezone: 'Asia/Colombo',
  weekly: [{ day: 'MONDAY' as const, open: '0800', close: '1700' }],
  holidays: [{ date: '2026-11-23' }]
};

describe('isOpen', () => {
  it('is open inside weekly hours in the company time zone', () => {
    // Monday 16 Nov 2026 10:00 in Colombo = 04:30 UTC
    expect(isOpen(hours, new Date('2026-11-16T04:30:00Z'))).toBe(true);
  });
  it('is closed outside hours', () => {
    expect(isOpen(hours, new Date('2026-11-16T13:00:00Z'))).toBe(false);
    expect(isOpen(hours, new Date('2026-11-17T04:30:00Z'))).toBe(false);
  });
  it('is closed on a holiday without times', () => {
    expect(isOpen(hours, new Date('2026-11-23T04:30:00Z'))).toBe(false);
  });
  it('counts as open when hours are off', () => {
    expect(isOpen({ ...hours, enabled: false }, new Date('2026-11-17T04:30:00Z'))).toBe(true);
  });
});
