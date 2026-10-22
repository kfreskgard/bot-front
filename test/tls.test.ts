import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acme from 'acme-client';
import { CertificateManager, expiryWarning, retryDelay, shouldRenew } from '../src/tls/acme';
import { createHttpApp } from '../src/tls/http';

const DAY = 86_400_000;
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('shouldRenew: 90-day certificate renews at day 60', () => {
  const nb = new Date('2026-01-01T00:00:00Z');
  const na = new Date(nb.getTime() + 90 * DAY);
  assert.equal(shouldRenew(nb, na, new Date(nb.getTime() + 59 * DAY)), false);
  assert.equal(shouldRenew(nb, na, new Date(nb.getTime() + 60 * DAY)), true);
});

test('shouldRenew: 6-day certificate renews at day 4', () => {
  const nb = new Date('2026-01-01T00:00:00Z');
  const na = new Date(nb.getTime() + 6 * DAY);
  assert.equal(shouldRenew(nb, na, new Date(nb.getTime() + 4 * DAY)), true);
  assert.equal(shouldRenew(nb, na, new Date(nb.getTime() + 3 * DAY)), false);
});

test('expiryWarning', () => {
  const na = new Date('2026-02-01T00:00:00Z');
  assert.equal(expiryWarning(na, new Date(na.getTime() - 8 * DAY)), null);
  assert.match(expiryWarning(na, new Date(na.getTime() - 7 * DAY)) ?? '', /expires/);
  assert.match(expiryWarning(na, new Date(na.getTime() + 1)) ?? '', /expired/);
  assert.match(expiryWarning(na, na) ?? '', /expired/);
});

test('retryDelay', () => {
  assert.deepEqual([0, 1, 2, 3].map(retryDelay), [60_000, 300_000, 1_800_000, 21_600_000]);
  assert.equal(retryDelay(10), 21_600_000);
});

function makeManager(dir: string, domain = 'bot.test', staging = true) {
  return new CertificateManager({
    domain,
    email: 'a@b.test',
    staging,
    certDir: dir,
    challenges: new Map(),
  });
}

function withDir(fn: (dir: string) => Promise<void>, copy = true) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-'));
    try {
      if (copy) {
        for (const f of ['cert.pem', 'key.pem']) fs.copyFileSync(path.join(fixtures, f), path.join(dir, f));
      }
      await fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('load returns the certificate inside its validity', withDir(async (dir) => {
  const info = acme.crypto.readCertificateInfo(fs.readFileSync(path.join(fixtures, 'cert.pem')));
  const c = await makeManager(dir).load(new Date(info.notBefore.getTime() + DAY));
  assert.ok(c);
  assert.match(c.cert, /BEGIN CERTIFICATE/);
  assert.match(c.key, /PRIVATE KEY/);
  assert.deepEqual(c.notBefore, info.notBefore);
  assert.deepEqual(c.notAfter, info.notAfter);
}));

test('load returns null for a domain the certificate does not cover', withDir(async (dir) => {
  assert.equal(await makeManager(dir, 'other.test').load(new Date(Date.now())), null);
}));

test('load returns null after expiry', withDir(async (dir) => {
  const c = await makeManager(dir).load(new Date());
  assert.ok(c);
  assert.equal(await makeManager(dir).load(new Date(c.notAfter.getTime() + DAY)), null);
}));

test('load returns null when key.pem belongs to a different key', withDir(async (dir) => {
  fs.writeFileSync(path.join(dir, 'key.pem'), await acme.crypto.createPrivateKey());
  assert.equal(await makeManager(dir).load(new Date()), null);
}));

test('load returns null for a garbage key.pem', withDir(async (dir) => {
  fs.writeFileSync(path.join(dir, 'key.pem'), 'garbage');
  assert.equal(await makeManager(dir).load(new Date()), null);
}));

test('load returns null for an unparseable cert.pem', withDir(async (dir) => {
  fs.writeFileSync(path.join(dir, 'cert.pem'), 'garbage');
  assert.equal(await makeManager(dir).load(new Date()), null);
}));

test('load matches the domain case-insensitively', withDir(async (dir) => {
  assert.ok(await makeManager(dir, 'BOT.test').load(new Date()));
}));

test('obtain rethrows account.key read errors other than ENOENT', withDir(async (dir) => {
  fs.mkdirSync(path.join(dir, 'account.key'));
  await assert.rejects(makeManager(dir).obtain(), (e: NodeJS.ErrnoException) => e.code === 'EISDIR');
}, false));

test('load returns null for an empty directory', withDir(async (dir) => {
  assert.equal(await makeManager(dir).load(new Date()), null);
}, false));

test('http app serves ACME challenges', async () => {
  const challenges = new Map([['t1', 'abc']]);
  const app = createHttpApp(challenges, 'bot.example.se', 443);
  const ok = await app.request('/.well-known/acme-challenge/t1');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type') ?? '', /text\/plain/);
  assert.equal(await ok.text(), 'abc');
  assert.equal((await app.request('/.well-known/acme-challenge/nope')).status, 404);
});

test('http app redirects to https without trusting Host', async () => {
  const app = createHttpApp(new Map(), 'bot.example.se', 443);
  const res = await app.request('http://evil.example/x?y=1', { headers: { Host: 'evil.example' } });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://bot.example.se/x?y=1');
  const post = await app.request('/x', { method: 'POST' });
  assert.equal(post.status, 301);
});

test('http app includes a non-default https port', async () => {
  const app = createHttpApp(new Map(), 'bot.example.se', 8443);
  const res = await app.request('http://evil.example/x?y=1', { headers: { Host: 'evil.example' } });
  assert.equal(res.headers.get('location'), 'https://bot.example.se:8443/x?y=1');
});

function withFixtureDir(prefix: string, fn: (dir: string) => Promise<void>) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-'));
    try {
      fs.copyFileSync(path.join(fixtures, `${prefix}-cert.pem`), path.join(dir, 'cert.pem'));
      fs.copyFileSync(path.join(fixtures, `${prefix}-key.pem`), path.join(dir, 'key.pem'));
      await fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('load accepts a certificate without a subject common name', withFixtureDir('nocn', async (dir) => {
  assert.ok(await makeManager(dir).load(new Date()));
}));

test('load rejects a staging certificate when staging is off', withFixtureDir('staging', async (dir) => {
  assert.equal(await makeManager(dir, 'bot.test', false).load(new Date()), null);
  assert.ok(await makeManager(dir, 'bot.test', true).load(new Date()));
}));

test('load keeps a non-staging certificate when staging is off', withDir(async (dir) => {
  assert.ok(await makeManager(dir, 'bot.test', false).load(new Date()));
}));
