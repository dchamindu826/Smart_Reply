import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone, initialsOf, maskPhone, normalizePhone, templateVariableCount, fillTemplate, formatMoney } from './format';
import { createInviteSchema, sendMessageSchema, createCompanySchema } from './schemas';

test('normalizePhone handles local and international numbers', () => {
  assert.equal(normalizePhone('077 123 4567'), '94771234567');
  assert.equal(normalizePhone('+94 77 123 4567'), '94771234567');
  assert.equal(normalizePhone('0094771234567'), '94771234567');
  assert.equal(normalizePhone('+1 (415) 555-0100'), '14155550100');
});

test('formatPhone and maskPhone', () => {
  assert.equal(formatPhone('94771234567'), '+94 77 123 4567');
  assert.equal(maskPhone('94771234567'), '9477****567');
});

test('initials', () => {
  assert.equal(initialsOf('Nimal Bandara'), 'NB');
  assert.equal(initialsOf('Madushan'), 'MA');
});

test('template helpers', () => {
  assert.equal(templateVariableCount('Hi {{1}}, total {{2}} by {{1}}'), 2);
  assert.equal(fillTemplate('Hi {{1}}, total {{2}}', ['Kasun', 'Rs. 10']), 'Hi Kasun, total Rs. 10');
  assert.equal(formatMoney(18500000), 'Rs. 185,000');
});

test('schemas', () => {
  assert.equal(sendMessageSchema.safeParse({ text: '' }).success, false);
  assert.equal(sendMessageSchema.safeParse({ text: 'hi' }).success, true);
  assert.equal(createInviteSchema.parse({ name: 'A', email: 'A@X.COM' }).email, 'a@x.com');
  assert.equal(createCompanySchema.safeParse({ name: 'X', seatLimit: 101, manager: { name: 'M', email: 'm@x.com' } }).success, false);
});
