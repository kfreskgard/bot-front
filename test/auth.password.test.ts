import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth';
import { parseConfig } from '../src/config';

test('round trip verifies the right password and rejects a wrong one', async () => {
  const stored = await hashPassword('hunter2');
  assert.equal(await verifyPassword('hunter2', stored), true);
  assert.equal(await verifyPassword('hunter3', stored), false);
});

test('round trip with non-ASCII password', async () => {
  const stored = await hashPassword('lösenord åäö');
  assert.equal(await verifyPassword('lösenord åäö', stored), true);
});

test('two hashes of the same password differ', async () => {
  assert.notEqual(await hashPassword('hunter2'), await hashPassword('hunter2'));
});

test('malformed stored values give false without throwing', async () => {
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.equal(await verifyPassword('x', 'scrypt$$'), false);
  assert.equal(await verifyPassword('x', 'bcrypt$a$b'), false);
});

test('hash output passes the config format check', async () => {
  const passwordHash = await hashPassword('hunter2');
  assert.match(passwordHash, /^scrypt\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
  const cfg = parseConfig({
    tls: false,
    httpPort: 80,
    botBackUrl: 'http://bot-back:1234',
    passwordHash,
    sessionSecret: Buffer.alloc(32, 7).toString('base64'),
  });
  assert.equal(cfg.passwordHash, passwordHash);
});
