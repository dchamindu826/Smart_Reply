import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWinClass, getWinText } from '../utils/windowTime.ts';

test('24-hour window colours', () => {
  const now = Date.now();
  assert.equal(getWinClass(undefined), 'x');
  assert.equal(getWinClass(now - 1000), 'x');
  assert.equal(getWinClass(now + 60 * 60_000), 'r');
  assert.equal(getWinClass(now + 10 * 3600_000), 'y');
  assert.equal(getWinClass(now + 23 * 3600_000), 'g');
});

test('window text', () => {
  assert.equal(getWinText(undefined), 'Closed');
  assert.match(getWinText(Date.now() + 3 * 3600_000 + 5 * 60_000), /^[23]h \d\dm$/);
});
