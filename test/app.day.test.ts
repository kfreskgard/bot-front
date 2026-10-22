import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import { hashPassword, LoginRateLimiter } from '../src/auth';
import type { BotBackClient, BotBackResult, PositionView } from '../src/botback';
import type { Config } from '../src/config';

const SECRET = Buffer.alloc(32, 7).toString('base64');
let hash = '';
before(async () => {
  hash = await hashPassword('pw');
});

const NOW = new Date('2026-10-22T08:42:15Z');

function pos(over: Partial<PositionView>): PositionView {
  return {
    id: 'p', stockId: 's', stockName: 'Stock', state: 'x', status: 'open', untracked: false,
    created: '2026-10-22T07:00:00Z', lastUpdated: '2026-10-22T07:00:00Z',
    targetAmount: 100, bought: 100, sold: 0, orderCount: 1,
    avgBuyPrice: 250, avgSellPrice: null, lastPrice: 254.1, lastPriceTime: '2026-10-22T08:41:30Z',
    result: 410, resultPercent: 1.64, ...over,
  };
}

const NOT_BOUGHT = {
  bought: 0, avgBuyPrice: null, lastPrice: null, lastPriceTime: null, result: null, resultPercent: null,
};

const POSITIONS: PositionView[] = [
  pos({ id: '1', stockName: 'Alpha' }),
  pos({ id: '2', stockName: 'Beta', lastPriceTime: '2026-10-22T08:39:00Z' }),
  pos({ id: '3', stockName: 'Gamma', result: null, resultPercent: null }),
  pos({ id: '4', stockName: 'Delta', untracked: true }),
  pos({ id: '5', stockName: 'Eps', status: 'pending', ...NOT_BOUGHT }),
  pos({ id: '6', stockName: 'Zeta', status: 'notFilled', ...NOT_BOUGHT }),
  pos({
    id: '7', stockName: 'H&M <b>', status: 'closed', sold: 100, avgSellPrice: 260,
    result: -1500, resultPercent: -2.5, lastPrice: null, lastPriceTime: null,
  }),
];

function setup(opts: { now?: () => Date; results?: BotBackResult[] } = {}) {
  const calls: string[] = [];
  const results = opts.results ?? [{ ok: true, data: { date: '2026-10-22', positions: POSITIONS } }];
  let i = 0;
  const botBack: BotBackClient = {
    getPositions: async (date) => {
      calls.push(date);
      return results[Math.min(i++, results.length - 1)];
    },
  };
  const config: Config = {
    domain: 'example.com', acmeEmail: 'a@example.com', acmeStaging: true, tls: true,
    httpPort: 80, httpsPort: 443, botBackUrl: 'http://localhost:1', passwordHash: hash, sessionSecret: SECRET,
  };
  const app = createApp({
    config, botBack, limiter: new LoginRateLimiter(), now: opts.now ?? (() => NOW),
    loginDelayMs: 0, clientIp: () => '1.2.3.4',
  });
  return { app, calls };
}

async function cookieFor(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await app.request(
    new Request('http://localhost/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
      body: new URLSearchParams({ password: 'pw' }),
    }),
  );
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

const POLL = /hx-get="\/partials\/positions\?date=2026-10-22"/;

describe('day page', () => {
  it('renders today with summary, rows in order, nav and polling', async () => {
    const { app, calls } = setup();
    const cookie = await cookieFor(app);
    const res = await app.request('/', { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.deepEqual(calls, ['2026-10-22']);
    assert.match(html, /5 positions taken/);
    assert.match(html, /Attempts: 1 pending · 1 not filled/);
    assert.match(html, /Updated 10:42:15/);
    assert.equal((html.match(/<tr class="pos/g) ?? []).length, 7);
    const order = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Eps', 'Zeta'].map((n) => html.indexOf(n));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(html, /href="\/\?date=2026-10-21"/);
    assert.doesNotMatch(html, /href="\/\?date=2026-10-23"/);
    assert.match(html, /<span class="disabled">▶<\/span>/);
    assert.match(html, /<div id="positions-panel"[^>]*hx-trigger="every 15s"/);
    assert.match(html, POLL);
    assert.match(html, /hx-swap="outerHTML"/);
    assert.match(html, /<form[^>]*action="\/logout"/);
    assert.match(html, /name="date"/);
    assert.doesNotMatch(html, /style=|<script>|\son\w+=/);
  });

  it('past date links forward and does not poll', async () => {
    const { app } = setup({ results: [{ ok: true, data: { date: '2026-10-20', positions: [] } }] });
    const cookie = await cookieFor(app);
    const html = await (await app.request('/?date=2026-10-20', { headers: { cookie } })).text();
    assert.match(html, /href="\/\?date=2026-10-21"/);
    assert.doesNotMatch(html, /hx-trigger/);
    assert.doesNotMatch(html, /class="disabled"/);
  });

  it('invalid date redirects to /', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    const res = await app.request('/?date=2026-02-30', { headers: { cookie } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/');
  });

  it('renders row cells', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    const html = await (await app.request('/', { headers: { cookie } })).text();
    assert.match(html, /254,10 · 10:41/);
    assert.match(html, /class="old-price"[^>]*>[^<]*254,10 · 10:39/);
    assert.equal((html.match(/old-price/g) ?? []).length, 1);
    assert.match(html, /unpriced<\/td>/);
    assert.match(html, /<tr class="pos untracked"/);
    assert.match(html, /<span class="untracked-label">untracked<\/span>/);
    assert.match(html, /H&amp;M &lt;b&gt;/);
    assert.doesNotMatch(html, /H&M <b>/);
    assert.match(html, /Not filled/);
    assert.match(html, /class="positive"[^>]*>[^<]*410/);
    assert.match(html, /class="negative"/);
    assert.match(html, /100\/100/);
  });

  it('pending and notFilled rows show a dash as result', async () => {
    const only = [POSITIONS[4], POSITIONS[5]];
    const { app } = setup({ results: [{ ok: true, data: { date: '2026-10-22', positions: only } }] });
    const cookie = await cookieFor(app);
    const html = await (await app.request('/partials/positions?date=2026-10-22', { headers: { cookie } })).text();
    const cells = html.match(/<td[^>]*data-label="Result"[^>]*>[^<]*<\/td>/g) ?? [];
    assert.equal(cells.length, 2);
    for (const c of cells) assert.match(c, />–<\/td>/);
  });
});

describe('positions partial', () => {
  it('returns only the panel with polling attributes', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    const res = await app.request('/partials/positions?date=2026-10-22', { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.doesNotMatch(html, /<html|<body/);
    assert.match(html, /^<div id="positions-panel"/);
    assert.match(html, POLL);
  });

  it('unreachable: 200, banner since first failure, polling, recovery', async () => {
    let t = NOW;
    const fail: BotBackResult = { ok: false, kind: 'unreachable', message: 'ECONNREFUSED' };
    const ok: BotBackResult = { ok: true, data: { date: '2026-10-22', positions: POSITIONS } };
    const { app } = setup({ now: () => t, results: [fail, fail, ok, fail] });
    const cookie = await cookieFor(app);
    const get = async () => app.request('/partials/positions?date=2026-10-22', { headers: { cookie } });
    const res = await get();
    assert.equal(res.status, 200);
    let html = await res.text();
    assert.match(html, /Bot unreachable since 10:42/);
    assert.match(html, POLL);
    t = new Date(NOW.getTime() + 60_000);
    html = await (await get()).text();
    assert.match(html, /Bot unreachable since 10:42/);
    html = await (await get()).text();
    assert.match(html, /Alpha/);
    assert.doesNotMatch(html, /Bot unreachable/);
    t = new Date(NOW.getTime() + 5 * 60_000);
    html = await (await get()).text();
    assert.match(html, /Bot unreachable since 10:47/);
  });

  it('bot error shows message with 200', async () => {
    const { app } = setup({ results: [{ ok: false, kind: 'error', message: 'boom' }] });
    const cookie = await cookieFor(app);
    const res = await app.request('/partials/positions?date=2026-10-22', { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Bot error: boom/);
  });

  it('stops polling after midnight', async () => {
    const { app } = setup({ now: () => new Date('2026-10-22T22:00:30Z') });
    const cookie = await cookieFor(app);
    const html = await (await app.request('/partials/positions?date=2026-10-22', { headers: { cookie } })).text();
    assert.match(html, /id="positions-panel"/);
    assert.doesNotMatch(html, /hx-trigger/);
  });

  it('invalid date gives 200 Invalid date without polling or bot-back call', async () => {
    const { app, calls } = setup();
    const cookie = await cookieFor(app);
    const res = await app.request('/partials/positions?date=x', { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Invalid date/);
    assert.doesNotMatch(html, /hx-trigger/);
    assert.deepEqual(calls, []);
  });

  it('without a session answers HX-Redirect to /login', async () => {
    const { app } = setup();
    const res = await app.request('/partials/positions?date=2026-10-22', { headers: { 'HX-Request': 'true' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('HX-Redirect'), '/login');
  });
});
