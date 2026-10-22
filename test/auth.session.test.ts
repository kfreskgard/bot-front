import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { clearSession, requireLogin, setSession } from '../src/auth';

const SECRET = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const T0 = new Date('2026-10-22T10:00:00Z');
const DAY = 86_400_000;

function makeApp(secure: boolean, clock: () => Date) {
  const app = new Hono();
  app.get('/set', async (c) => {
    await setSession(c, SECRET, secure, clock());
    return c.text('ok');
  });
  app.get('/clear', (c) => {
    clearSession(c);
    return c.text('cleared');
  });
  app.use('/p', requireLogin(SECRET, clock));
  app.get('/p', (c) => c.text('page'));
  return app;
}

async function getCookie(app: Hono): Promise<{ header: string; pair: string }> {
  const res = await app.request('/set');
  const header = res.headers.get('set-cookie') ?? '';
  return { header, pair: header.split(';')[0] };
}

test('setSession sets a hardened cookie', async () => {
  const { header } = await getCookie(makeApp(true, () => T0));
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Strict/i);
  assert.match(header, /Path=\//);
  assert.match(header, /Max-Age=2592000/);
  assert.match(header, /Secure/i);
});

test('Secure is omitted when secure is false', async () => {
  const { header } = await getCookie(makeApp(false, () => T0));
  assert.doesNotMatch(header, /Secure/i);
});

test('valid cookie passes requireLogin', async () => {
  const app = makeApp(true, () => T0);
  const { pair } = await getCookie(app);
  const res = await app.request('/p', { headers: { cookie: pair } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'page');
});

test('cookie is rejected 31 days later', async () => {
  let clock = T0;
  const app = makeApp(true, () => clock);
  const { pair } = await getCookie(app);
  clock = new Date(T0.getTime() + 31 * DAY);
  const res = await app.request('/p', { headers: { cookie: pair } });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('tampered value or signature is rejected', async () => {
  const app = makeApp(true, () => T0);
  const { pair } = await getCookie(app);
  const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
  const dot = value.lastIndexOf('.');
  const farFuture = encodeURIComponent(String(T0.getTime() + 999 * DAY));
  const badValue = `${name}=${farFuture}${value.slice(dot)}`;
  const badSig = `${name}=${value.slice(0, -3)}AAA`;
  for (const cookie of [badValue, badSig]) {
    const res = await app.request('/p', { headers: { cookie } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
  }
});

test('no cookie redirects to /login', async () => {
  const res = await makeApp(true, () => T0).request('/p');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('no cookie with HX-Request gets HX-Redirect', async () => {
  const res = await makeApp(true, () => T0).request('/p', { headers: { 'HX-Request': 'true' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('hx-redirect'), '/login');
  assert.equal(await res.text(), '');
});

test('clearSession expires the cookie', async () => {
  const res = await makeApp(true, () => T0).request('/clear');
  const header = res.headers.get('set-cookie') ?? '';
  assert.match(header, /^session=;/);
  assert.match(header, /Max-Age=0/);
});
