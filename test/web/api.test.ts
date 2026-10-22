import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, fetchJson } from '../../web/api.js';
import { pollInterval } from '../../web/query.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('fetchJson returns the parsed body on 200', async () => {
  let init: RequestInit | undefined;
  const f = (async (_p: unknown, i?: RequestInit) => {
    init = i;
    return json({ a: 1 });
  }) as typeof fetch;
  assert.deepEqual(await fetchJson('/api/x', { fetch: f }), { a: 1 });
  assert.deepEqual(init, { credentials: 'same-origin', headers: { accept: 'application/json' } });
});

test('fetchJson maps a 502 ApiErrorBody', async () => {
  const since = '2026-10-22T08:42:00.000Z';
  const f = (async () => json({ error: { kind: 'unreachable', message: 'ECONNREFUSED', since } }, 502)) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f }), (e: ApiError) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.name, 'ApiError');
    assert.equal(e.status, 502);
    assert.equal(e.kind, 'unreachable');
    assert.equal(e.message, 'ECONNREFUSED');
    assert.equal(e.since, since);
    return true;
  });
});

test('fetchJson calls onUnauthorized on 401', async () => {
  let calls = 0;
  const f = (async () => json({ error: { kind: 'unauthorized', message: 'x' } }, 401)) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f, onUnauthorized: () => void calls++ }), (e: ApiError) => {
    assert.equal(e.kind, 'unauthorized');
    assert.equal(e.status, 401);
    assert.equal(e.message, 'Not logged in');
    return true;
  });
  assert.equal(calls, 1);
});

test('fetchJson maps a network failure', async () => {
  const f = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f }), (e: ApiError) => {
    assert.equal(e.status, 0);
    assert.equal(e.kind, 'network');
    assert.equal(e.message, "Can't reach bot-front");
    return true;
  });
});

test('fetchJson treats a non-JSON 200 as an error', async () => {
  const f = (async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f }), (e: ApiError) => {
    assert.equal(e.kind, 'error');
    assert.equal(e.message, 'Unexpected response from bot-front');
    return true;
  });
});

test('fetchJson treats HTML labelled as JSON on 200 as an error', async () => {
  const f = (async () => new Response('<html>', { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f }), (e: ApiError) => e.message === 'Unexpected response from bot-front');
});

test('fetchJson maps a non-JSON 500', async () => {
  const f = (async () => new Response('oops', { status: 500 })) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f }), (e: ApiError) => {
    assert.equal(e.kind, 'error');
    assert.equal(e.status, 500);
    assert.equal(e.message, 'HTTP 500');
    return true;
  });
});

test('fetchJson maps a JSON non-2xx without an error object to HTTP status', async () => {
  const f = (async () => json({ nope: true }, 503)) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f }), (e: ApiError) => e.kind === 'error' && e.message === 'HTTP 503');
});

test('pollInterval polls only today in Stockholm', () => {
  assert.equal(pollInterval('2026-10-22', new Date('2026-10-22T08:00:00Z')), 15000);
  assert.equal(pollInterval('2026-10-21', new Date('2026-10-22T08:00:00Z')), false);
  assert.equal(pollInterval('2026-10-22', new Date('2026-10-22T22:00:01Z')), false);
});

test('fetchJson drops a since that is not a date instead of rejecting the body', async () => {
  const f = (async () => json({ error: { kind: 'unreachable', message: 'down', since: 'garbage' } }, 502)) as typeof fetch;
  await assert.rejects(fetchJson('/api/x', { fetch: f }), (e: ApiError) => {
    assert.equal(e.kind, 'unreachable');
    assert.equal(e.message, 'down');
    assert.equal(e.since, null);
    return true;
  });
});
