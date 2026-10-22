import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isValidDate, todayStockholm } from '../src/day';

test('todayStockholm uses the Stockholm calendar date', () => {
  assert.equal(todayStockholm(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
  assert.equal(todayStockholm(new Date('2026-10-21T21:30:00Z')), '2026-10-21');
});

test('isValidDate accepts only real calendar dates', () => {
  assert.equal(isValidDate('2026-10-22'), true);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-01'), false);
  assert.equal(isValidDate('nope'), false);
});

test('addDays crosses month and DST boundaries', () => {
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
