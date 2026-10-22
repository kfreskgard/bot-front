import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PositionView } from '../shared/types';
import { summarize, summaryText } from '../shared/summary';

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

test('summaryText full line', () => {
  assert.equal(
    summaryText(summarize(mixed())).taken,
    '4 positions taken · 2 closed +312 kr' +
      ' · 2 open +104 kr (1 unpriced) · total +416 kr (1 unpriced)',
  );
});

test('summaryText omits unpriced parts when none', () => {
  const s = summarize([pos({ status: 'closed', result: 10 }), pos({ status: 'open', result: 5 })]);
  assert.equal(summaryText(s).taken, '2 positions taken · 1 closed +10 kr · 1 open +5 kr · total +15 kr');
});

test('summaryText singular and negative total', () => {
  const s = summarize([pos({ status: 'closed', result: -50 })]);
  assert.equal(
    summaryText(s).taken,
    '1 position taken · 1 closed −50 kr · 0 open 0 kr · total −50 kr',
  );
});

test('attempts text', () => {
  const s = summarize([
    pos({ status: 'pending', bought: 0, result: null }),
    pos({ status: 'noOrder', bought: 0, result: null }),
    pos({ status: 'notFilled', bought: 0, result: null }),
  ]);
  assert.equal(summaryText(s).attempts, 'Attempts: 1 pending · 1 not filled · 1 no order');
  const only = summarize([pos({ status: 'notFilled', bought: 0, result: null })]);
  assert.equal(summaryText(only).attempts, 'Attempts: 1 not filled');
  assert.equal(summaryText(summarize([])).attempts, null);
});
