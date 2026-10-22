import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PositionView } from '../shared/types';
import { summarize } from '../shared/summary';

let n = 0;
function pos(over: Partial<PositionView>): PositionView {
  n += 1;
  return {
    id: `p${n}`,
    stockId: 's',
    stockName: 'Stock',
    state: 'x',
    status: 'open',
    untracked: false,
    created: '2026-10-22T08:00:00Z',
    lastUpdated: '2026-10-22T08:00:00Z',
    targetAmount: 1000,
    bought: 10,
    sold: 0,
    orderCount: 1,
    avgBuyPrice: 100,
    avgSellPrice: null,
    lastPrice: 100,
    lastPriceTime: '2026-10-22T08:00:00Z',
    result: 0,
    resultPercent: 0,
    ...over,
  };
}

const mixed = () => [
  pos({ status: 'closed', result: 156 }),
  pos({ status: 'closed', result: 156 }),
  pos({ status: 'open', result: 104 }),
  pos({ status: 'open', result: null }),
];

test('summarize sums closed and open results', () => {
  const s = summarize(mixed());
  assert.equal(s.taken, 4);
  assert.deepEqual(s.closed, { count: 2, result: 312 });
  assert.deepEqual(s.open, { count: 2, result: 104, unpriced: 1 });
  assert.deepEqual(s.total, { result: 416, unpriced: 1 });
});

test('an untracked open position is taken and unpriced', () => {
  const s = summarize([pos({ status: 'open', untracked: true, result: null })]);
  assert.equal(s.taken, 1);
  assert.deepEqual(s.open, { count: 1, result: 0, unpriced: 1 });
});

test('attempts are not taken', () => {
  const s = summarize([
    pos({ status: 'pending', bought: 0, result: null }),
    pos({ status: 'noOrder', bought: 0, result: null }),
    pos({ status: 'notFilled', bought: 0, result: null }),
  ]);
  assert.equal(s.taken, 0);
  assert.deepEqual(s.attempts, { pending: 1, notFilled: 1, noOrder: 1 });
});
