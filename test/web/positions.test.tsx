import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { ApiError } from '../../web/api.js';
import { PositionsContent } from '../../web/pages/positions/PositionsContent.js';
import { PositionsView } from '../../web/pages/positions/PositionsView.js';
import { NOT_BOUGHT, POSITIONS, pos } from '../helpers/positions.js';

const NOW = new Date('2026-10-22T08:42:15Z');
const content = (positions = POSITIONS) =>
  render(<PositionsContent data={{ date: '2026-10-22', positions }} now={NOW} />);

test('content shows KPIs and rows in created order', () => {
  const h = content();
  assert.match(h, /Taken[\s\S]*>5</);
  assert.match(h, /1 pending · 1 not filled/);
  const order = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Eps', 'Zeta'].map((n) => h.indexOf(n));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('rows are sorted by created, not by input order', () => {
  const h = content([
    pos({ id: 'b', stockName: 'Later', created: '2026-10-22T09:00:00Z' }),
    pos({ id: 'a', stockName: 'Earlier', created: '2026-10-22T07:00:00Z' }),
  ]);
  assert.ok(h.indexOf('Earlier') < h.indexOf('Later'));
});

test('row cells follow the display rules', () => {
  const h = content();
  assert.match(h, /254,10 · 10:41/);
  assert.equal(h.match(/old-price/g)?.length, 1);
  assert.match(h, /old-price[^>]*>[^<]*254,10 · 10:39/);
  assert.match(h, /unpriced/);
  assert.match(h, /<tr class="[^"]*untracked/);
  assert.match(h, /untracked-label/);
  assert.ok(h.includes('H&amp;M &lt;b&gt;'));
  assert.ok(!h.includes('H&M <b>'));
  assert.match(h, /NOT FILLED/);
  assert.match(h, /money pos[^>]*>\+410\skr/);
  assert.match(h, /money neg/);
  assert.match(h, /100\/100/);
});

test('partly sold open position shows the live price', () => {
  const h = content([pos({ bought: 40, sold: 20, avgSellPrice: 255 })]);
  assert.match(h, /254,10 · 10:41/);
  assert.doesNotMatch(h, /255,00/);
});

test('pending and notFilled rows show a dash as result', () => {
  const h = content([POSITIONS[4]!, POSITIONS[5]!]);
  assert.equal(h.match(/data-label="Result"[^>]*>–</g)?.length, 2);
});

test('an empty day shows zero KPIs and a message', () => {
  const h = render(<PositionsContent data={{ date: '2026-10-20', positions: [] }} now={NOW} />);
  assert.match(h, /No positions on this day/);
  assert.doesNotMatch(h, /<table/);
  assert.match(h, /0\skr/);
});


const view = (over: Partial<Parameters<typeof PositionsView>[0]>) =>
  render(
    <PositionsView
      date="2026-10-22" now={NOW} data={undefined} error={null} dataUpdatedAt={0} isPending={false} {...over}
    />,
  );

test('view: error without data shows only the banner', () => {
  const error = new ApiError(502, 'unreachable', 'x', '2026-10-22T08:40:00.000Z');
  const h = view({ error });
  assert.match(h, /Bot unreachable since 10:40/);
  assert.doesNotMatch(h, /<table/);
  assert.doesNotMatch(h, /stale/);
});

test('view: error with data shows banner, time of data and dimmed content', () => {
  const error = new ApiError(502, 'error', 'boom');
  const h = view({
    error,
    data: { date: '2026-10-22', positions: POSITIONS },
    dataUpdatedAt: Date.parse('2026-10-22T08:41:57Z'),
  });
  assert.match(h, /Bot error: boom/);
  assert.match(h, /showing data from 10:41:57/);
  assert.match(h, /class="stale"/);
  assert.match(h, /Alpha/);
});

test('view: network error text', () => {
  const h = view({ error: new ApiError(0, 'network', 'down') });
  assert.match(h, /Can(&#x27;|')t reach bot-front/);
});

test('view: pending shows skeleton', () => {
  assert.match(view({ isPending: true }), /class="skeleton"/);
});

test('view: data without error shows content', () => {
  const h = view({ data: { date: '2026-10-22', positions: [pos({ ...NOT_BOUGHT, stockName: 'Solo', status: 'noOrder' })] } });
  assert.match(h, /Solo/);
  assert.doesNotMatch(h, /role="alert"/);
});
