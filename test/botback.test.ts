import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBotBackClient, validatePositionsResponse } from '../src/botback';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

let current: Handler = (_req, res) => res.end();
const requests: string[] = [];

const server = http.createServer((req, res) => {
  requests.push(req.url ?? '');
  current(req, res);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(() => {
  server.closeAllConnections();
  server.close();
});

function reply(status: number, contentType: string, body: string): void {
  current = (_req, res) => {
    res.writeHead(status, { 'content-type': contentType });
    res.end(body);
  };
}

const position = {
  id: 'p1',
  stockId: '5471',
  stockName: 'Getinge',
  state: 'BoughtAll',
  status: 'open',
  untracked: false,
  created: '2026-10-22T08:58:03.120Z',
  lastUpdated: '2026-10-22T09:01:12.004Z',
  targetAmount: 40,
  bought: 40,
  sold: 0,
  orderCount: 1,
  avgBuyPrice: 251.5,
  avgSellPrice: null,
  lastPrice: 254.1,
  lastPriceTime: '2026-10-22T09:41:57.000Z',
  result: 104,
  resultPercent: 1.03,
};

test('200 with a valid body returns the parsed data', async () => {
  requests.length = 0;
  const body = { date: '2026-10-22', positions: [position] };
  reply(200, 'application/json', JSON.stringify(body));
  const result = await createBotBackClient(baseUrl).getPositions('2026-10-22');
  assert.deepEqual(result, { ok: true, data: body });
  assert.deepEqual(requests, ['/view/positions?date=2026-10-22']);
});

test('a trailing slash on the base URL does not break the path', async () => {
  requests.length = 0;
  reply(200, 'application/json', JSON.stringify({ date: '2026-10-22', positions: [] }));
  const result = await createBotBackClient(`${baseUrl}/`).getPositions('2026-10-22');
  assert.equal(result.ok, true);
  assert.deepEqual(requests, ['/view/positions?date=2026-10-22']);
});

test('500 with an error body uses the error string', async () => {
  reply(500, 'application/json', '{"error":"boom"}');
  const result = await createBotBackClient(baseUrl).getPositions('2026-10-22');
  assert.deepEqual(result, { ok: false, kind: 'error', message: 'boom' });
});

test('404 with an HTML body gives an error mentioning 404', async () => {
  reply(404, 'text/html', '<html>Not found</html>');
  const result = await createBotBackClient(baseUrl).getPositions('2026-10-22');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.kind, 'error');
    assert.match(result.message, /404/);
  }
});

test('200 with HTML gives an error', async (t) => {
  t.mock.method(console, 'warn', () => {});
  reply(200, 'text/html', '<html></html>');
  const result = await createBotBackClient(baseUrl).getPositions('2026-10-22');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'error');
});

test('200 without a positions array gives an error', async (t) => {
  t.mock.method(console, 'warn', () => {});
  reply(200, 'application/json', '{"date":"2026-10-22"}');
  const result = await createBotBackClient(baseUrl).getPositions('2026-10-22');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'error');
});

test('a server that never answers gives unreachable after the timeout', async () => {
  current = () => {};
  const result = await createBotBackClient(baseUrl, 50).getPositions('2026-10-22');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'unreachable');
  server.closeAllConnections();
});

test('a closed port gives unreachable', async () => {
  const tmp = http.createServer();
  await new Promise<void>((resolve) => tmp.listen(0, '127.0.0.1', resolve));
  const port = (tmp.address() as AddressInfo).port;
  await new Promise<void>((resolve) => tmp.close(() => resolve()));
  const result = await createBotBackClient(`http://127.0.0.1:${port}`).getPositions('2026-10-22');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'unreachable');
});

const VALID = position;

test('validatePositionsResponse accepts a valid response and keeps unknown fields', () => {
  const r = validatePositionsResponse({ date: '2026-10-22', positions: [{ ...VALID, extra: 1 }], more: true });
  assert.equal(r.ok, true);
  assert.equal((r as any).data.positions[0].extra, 1);
});

for (const [name, mutate, path] of [
  ['date format', (b: any) => { b.date = '22/10/2026'; }, 'date'],
  ['positions not array', (b: any) => { b.positions = {}; }, 'positions'],
  ['null row', (b: any) => { b.positions[0] = null; }, 'positions[0]'],
  ['status', (b: any) => { b.positions[0].status = 'sold'; }, 'positions[0].status'],
  ['missing stockName', (b: any) => { delete b.positions[0].stockName; }, 'positions[0].stockName'],
  ['untracked string', (b: any) => { b.positions[0].untracked = 'false'; }, 'positions[0].untracked'],
  ['created not a date', (b: any) => { b.positions[0].created = 'yesterday'; }, 'positions[0].created'],
  ['bought string', (b: any) => { b.positions[0].bought = '10'; }, 'positions[0].bought'],
  ['result NaN', (b: any) => { b.positions[0].result = NaN; }, 'positions[0].result'],
  ['lastPrice Infinity', (b: any) => { b.positions[0].lastPrice = Infinity; }, 'positions[0].lastPrice'],
  ['lastPriceTime garbage', (b: any) => { b.positions[0].lastPriceTime = 'garbage'; }, 'positions[0].lastPriceTime'],
] as const) {
  test(`validatePositionsResponse rejects ${name}`, () => {
    const body = structuredClone({ date: '2026-10-22', positions: [VALID] }) as any;
    mutate(body);
    assert.deepEqual(validatePositionsResponse(body), { ok: false, path });
  });
}

test('a 200 with malformed positions is an error result', async (t) => {
  t.mock.method(console, 'warn', () => {});
  reply(200, 'application/json', JSON.stringify({ date: '2026-10-22', positions: [{ ...VALID, status: 'sold' }] }));
  const r = await createBotBackClient(baseUrl).getPositions('2026-10-22');
  assert.deepEqual(r, { ok: false, kind: 'error', message: 'Unexpected response from bot' });
});
