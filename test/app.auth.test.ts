import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, type AppDeps } from '../src/app';
import { hashPassword, LoginRateLimiter, SESSION_COOKIE } from '../src/auth';
import type { BotBackClient } from '../src/botback';
import type { Config } from '../src/config';

const SECRET = Buffer.alloc(32, 7).toString('base64');
let hash = '';

before(async () => {
  hash = await hashPassword('pw');
});

function makeConfig(tls: boolean): Config {
  return {
    domain: 'example.com',
    acmeEmail: 'a@example.com',
    acmeStaging: true,
    tls,
    httpPort: 80,
    httpsPort: 443,
    botBackUrl: 'http://localhost:1',
    passwordHash: hash,
    sessionSecret: SECRET,
  };
}

const botBack: BotBackClient = {
  getPositions: async () => ({ ok: false, kind: 'unreachable', message: 'unused' }),
};

function setup(tls = true) {
  const limiter = new LoginRateLimiter();
  const deps: AppDeps = {
    config: makeConfig(tls),
    botBack,
    limiter,
    now: () => new Date(),
    loginDelayMs: 0,
    clientIp: () => '1.2.3.4',
  };
  return { app: createApp(deps), limiter };
}

function loginRequest(password?: string): Request {
  const body = password === undefined ? new URLSearchParams() : new URLSearchParams({ password });
  return new Request('http://localhost/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
    body,
  });
}

function cookieHeader(res: Response): string {
  const set = res.headers.get('set-cookie') ?? '';
  return set.split(';')[0];
}

describe('app auth', () => {
  it('GET /login renders a form posting password to /login', async () => {
    const { app } = setup();
    const res = await app.request('/login');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<form[^>]*method="post"[^>]*action="\/login"|<form[^>]*action="\/login"[^>]*method="post"/i);
    assert.match(html, /name="password"/);
  });

  it('POST /login with the right password redirects to / and sets the session cookie', async () => {
    const { app } = setup();
    const res = await app.request(loginRequest('pw'));
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/');
    assert.match(res.headers.get('set-cookie') ?? '', new RegExp(`^${SESSION_COOKIE}=`));
  });

  it('wrong password gives 401 and counts a failure', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { app, limiter } = setup();
    const res = await app.request(loginRequest('nope'));
    assert.equal(res.status, 401);
    assert.match(await res.text(), /Wrong password/);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(limiter.size, 1);
  });

  it('a body without a password field gives 401, not 500', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { app } = setup();
    const res = await app.request(loginRequest());
    assert.equal(res.status, 401);
    assert.match(await res.text(), /Wrong password/);
  });

  it('locks out after 5 failures even with the right password', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { app } = setup();
    for (let i = 0; i < 5; i++) {
      assert.equal((await app.request(loginRequest('nope'))).status, 401);
    }
    const res = await app.request(loginRequest('pw'));
    assert.equal(res.status, 429);
    assert.match(await res.text(), /Too many attempts/);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  it('POST /logout with a session redirects to /login and clears the cookie', async () => {
    const { app } = setup();
    const login = await app.request(loginRequest('pw'));
    const res = await app.request('http://localhost/logout', {
      method: 'POST',
      headers: { cookie: cookieHeader(login), origin: 'http://localhost' },
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
    const set = res.headers.get('set-cookie') ?? '';
    assert.match(set, new RegExp(`^${SESSION_COOKIE}=;`));
    assert.match(set, /Max-Age=0/i);
  });

  it('POST /logout without a session redirects to /login without clearing', async () => {
    const { app } = setup();
    const res = await app.request('http://localhost/logout', { method: 'POST', headers: { origin: 'http://localhost' } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
  });

  it('GET / requires a session', async () => {
    const { app } = setup();
    const res = await app.request('/');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
  });

  it('serves static files without a session', async () => {
    const { app } = setup();
    const res = await app.request('/static/htmx.min.js');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /htmx/);
  });

  it('sets security headers on every response', async () => {
    const { app } = setup(true);
    for (const path of ['/login', '/static/htmx.min.js', '/']) {
      const res = await app.request(path);
      assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/, path);
      assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000', path);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    }
  });

  it('omits Strict-Transport-Security when tls is off', async () => {
    const { app } = setup(false);
    const res = await app.request('/login');
    assert.equal(res.headers.get('strict-transport-security'), null);
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  });

  it('login page loads htmx config meta and no inline script or style', async () => {
    const { app } = setup();
    const html = await (await app.request('/login')).text();
    assert.match(html, /<meta name="htmx-config" content="\{&quot;includeIndicatorStyles&quot;:false\}"|<meta name="htmx-config" content='\{"includeIndicatorStyles":false\}'/);
    assert.doesNotMatch(html, /style=|<style|\son\w+=/);
  });

  it('starts the login page with a doctype', async () => {
    const { app } = setup();
    const html = await (await app.request('/login')).text();
    assert.match(html, /^<!doctype html>/i);
  });

  it('sets the extra CSP directives', async () => {
    const { app } = setup();
    const csp = (await app.request('/login')).headers.get('content-security-policy') ?? '';
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, /form-action 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
  });

  it('rejects an oversized login body with 413', async () => {
    const { app } = setup();
    const res = await app.request(loginRequest('x'.repeat(10_000)));
    assert.equal(res.status, 413);
  });

  it('treats a malformed multipart body as a wrong password, not a 500', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { app, limiter } = setup();
    const res = await app.request(
      new Request('http://localhost/login', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=xyz', origin: 'http://localhost' },
        body: 'garbage without boundaries',
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(limiter.size, 1);
  });

  it('rejects a cross-origin POST /login and does not count it', async () => {
    const { app, limiter } = setup();
    const req = new Request('http://localhost/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://evil.example' },
      body: new URLSearchParams({ password: 'pw' }),
    });
    const res = await app.request(req);
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(limiter.size, 0);
  });

  it('concurrent wrong attempts are limited and none succeeds', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const limiter = new LoginRateLimiter();
    const app = createApp({
      config: makeConfig(true), botBack, limiter, now: () => new Date(),
      loginDelayMs: 50, clientIp: () => '1.2.3.4',
    });
    const results = await Promise.all(Array.from({ length: 8 }, () => app.request(loginRequest('nope'))));
    const statuses = results.map((r) => r.status);
    assert.ok(statuses.filter((s) => s === 429).length >= 3, statuses.join());
    assert.ok(!statuses.includes(302));
  });

  it('a correct password in a concurrent batch after the limit gets no session', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const limiter = new LoginRateLimiter();
    const app = createApp({
      config: makeConfig(true), botBack, limiter, now: () => new Date(),
      loginDelayMs: 50, clientIp: () => '1.2.3.4',
    });
    const batch = [
      ...Array.from({ length: 5 }, () => app.request(loginRequest('nope'))),
      app.request(loginRequest('pw')),
    ];
    const results = await Promise.all(batch);
    assert.equal(results[5].status, 429);
    assert.equal(results[5].headers.get('set-cookie'), null);
  });
});
