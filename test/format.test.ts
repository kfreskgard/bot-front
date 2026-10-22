import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatKr, formatPercent, formatPrice, formatTime, isPriceOld } from '../src/views/format';

test('formatKr', () => {
  assert.equal(formatKr(1234), '+1 234 kr');
  assert.equal(formatKr(-50), '−50 kr');
  assert.equal(formatKr(0), '0 kr');
  assert.equal(formatKr(155.6), '+156 kr');
});

test('formatPrice', () => {
  assert.equal(formatPrice(254.1), '254,10');
  assert.equal(formatPrice(1234.5), '1 234,50');
});

test('formatPercent', () => {
  assert.equal(formatPercent(1.03), '+1,03 %');
  assert.equal(formatPercent(-2), '−2,00 %');
  assert.equal(formatPercent(0), '0,00 %');
});

test('formatTime renders Stockholm time', () => {
  assert.equal(formatTime('2026-10-22T08:41:07Z'), '10:41');
  assert.equal(formatTime('2026-10-22T08:41:07Z', true), '10:41:07');
  assert.equal(formatTime('2026-01-22T08:41:07Z'), '09:41');
});

test('isPriceOld is strictly more than two minutes', () => {
  const now = new Date('2026-10-22T08:00:00Z');
  assert.equal(isPriceOld('2026-10-22T07:58:00Z', now), false);
  assert.equal(isPriceOld('2026-10-22T07:57:59Z', now), true);
});
