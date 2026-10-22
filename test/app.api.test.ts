import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import { hashPassword, LoginRateLimiter } from '../src/auth';
import type { BotBackClient, BotBackResult } from '../src/botback';
import type { Config } from '../src/config';
import { POSITIONS } from './helpers/positions';

const SECRET = Buffer.alloc(32, 7).toString('base64');
let hash = '';
before(async () => {
  hash = await hashPassword('pw');
});

const NOW = new Date('2026-10-22T08:42:15Z');

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

type ErrorJson = { error: { kind: string; message: string; since?: string } };

describe('GET /api/positions', () => {
  it('passes bot-back data through with no-store', async () => {
    const { app, calls } = setup();
    const cookie = await cookieFor(app);
    const res = await app.request('/api/positions?date=2026-10-22', { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { date: '2026-10-22', positions: POSITIONS });
    assert.deepEqual(calls, ['2026-10-22']);
  });

  it('unreachable gives 502 with since; since holds across failures and resets after success', async () => {
    const T0 = NOW;
    let t = T0;
    const fail: BotBackResult = { ok: false, kind: 'unreachable', message: 'ECONNREFUSED' };
    const ok: BotBackResult = { ok: true, data: { date: '2026-10-22', positions: POSITIONS } };
    const { app } = setup({ now: () => t, results: [fail, fail, ok, fail] });
    const cookie = await cookieFor(app);
    const get = async (offsetMs: number) => {
      t = new Date(T0.getTime() + offsetMs);
      return app.request('/api/positions?date=2026-10-22', { headers: { cookie } });
    };
    let res = await get(0);
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    let body = (await res.json()) as ErrorJson;
    assert.equal(body.error.kind, 'unreachable');
    assert.equal(body.error.since, T0.toISOString());
    res = await get(15_000);
    assert.equal(res.status, 502);
    body = (await res.json()) as ErrorJson;
    assert.equal(body.error.since, T0.toISOString());
    res = await get(30_000);
    assert.equal(res.status, 200);
    res = await get(45_000);
    assert.equal(res.status, 502);
    body = (await res.json()) as ErrorJson;
    assert.equal(body.error.since, new Date(T0.getTime() + 45_000).toISOString());
  });

  it('bot error gives 502 with kind error and the message', async () => {
    const { app } = setup({ results: [{ ok: false, kind: 'error', message: 'HTTP 500' }] });
    const cookie = await cookieFor(app);
    const res = await app.request('/api/positions?date=2026-10-22', { headers: { cookie } });
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), {
      error: { kind: 'error', message: 'HTTP 500', since: NOW.toISOString() },
    });
  });

  it('invalid or missing date gives 400 without calling bot-back', async () => {
    const { app, calls } = setup();
    const cookie = await cookieFor(app);
    for (const q of ['', '?date=x', '?date=2026-02-30']) {
      const res = await app.request(`/api/positions${q}`, { headers: { cookie } });
      assert.equal(res.status, 400, q);
      assert.equal(res.headers.get('cache-control'), 'no-store', q);
      assert.deepEqual(await res.json(), { error: { kind: 'badRequest', message: 'Invalid date' } });
    }
    assert.deepEqual(calls, []);
  });

  it('without a session gives 401 JSON', async () => {
    const { app, calls } = setup();
    const res = await app.request('/api/positions?date=2026-10-22');
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('location'), null);
    assert.deepEqual(await res.json(), { error: { kind: 'unauthorized', message: 'Not logged in' } });
    assert.deepEqual(calls, []);
  });
});
