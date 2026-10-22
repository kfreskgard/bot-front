import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import { hashPassword, LoginRateLimiter } from '../src/auth';
import type { BotBackClient, BotBackResult } from '../src/botback';
import type { Config } from '../src/config';
import { POSITIONS } from './helpers/positions';
import { fakeWebBundle } from './helpers/web';

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
    config, botBack, web: fakeWebBundle(), limiter: new LoginRateLimiter(), now: opts.now ?? (() => NOW),
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

describe('SPA and assets', () => {
  it('serves the SPA page for any path with a session', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    for (const url of ['/', '/positions', '/whatever?date=2026-10-22']) {
      const res = await app.request(url, { headers: { cookie } });
      assert.equal(res.status, 200, url);
      assert.equal(res.headers.get('cache-control'), 'no-store', url);
      const html = await res.text();
      assert.ok(html.startsWith('<!doctype html>'), url);
      assert.match(html, /\/assets\/main-TEST\.js/);
      assert.match(html, /\/assets\/main-TEST\.css/);
      assert.ok(html.includes('<div id="root"></div>'));
      assert.doesNotMatch(html, /style=|<script>/);
    }
  });

  it('redirects to /login without a session', async () => {
    const { app } = setup();
    const res = await app.request('/positions');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
  });

  it('serves known assets immutable without a session', async () => {
    const { app } = setup();
    const res = await app.request('/assets/main-TEST.css');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  it('404s unknown asset names strictly', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    for (const headers of [{}, { cookie }] as Record<string, string>[]) {
      const res = await app.request('/assets/nope.js', { headers });
      assert.equal(res.status, 404);
      assert.doesNotMatch(await res.text(), /<!doctype|"js"/i);
    }
  });

  it('404s encoded traversal asset paths strictly, with and without a session', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    for (const url of ['/assets/%2e%2e%2fmanifest.json', '/assets/..%2Fmanifest.json', '/assets/..%5cmanifest.json']) {
      for (const headers of [{}, { cookie }] as Record<string, string>[]) {
        const res = await app.request(url, { headers });
        assert.equal(res.status, 404, url);
        assert.doesNotMatch(await res.text(), /"js"|<!doctype/i, url);
      }
    }
  });

  it('never serves the manifest for a normalised traversal path', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    // The URL parser turns this into /manifest.json, which is the SPA catch-all.
    const anon = await app.request('/assets/../manifest.json');
    assert.equal(anon.status, 302);
    assert.equal(anon.headers.get('location'), '/login');
    const res = await app.request('/assets/../manifest.json', { headers: { cookie } });
    const body = await res.text();
    assert.ok(res.status === 404 || body.startsWith('<!doctype html>'));
    assert.doesNotMatch(body, /"js"/);
  });

  it('404s unknown /api paths with JSON, not the SPA', async () => {
    const { app } = setup();
    const cookie = await cookieFor(app);
    const res = await app.request('/api/nope', { headers: { cookie } });
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await res.json(), { error: { kind: 'badRequest', message: 'Not found' } });
  });
});
