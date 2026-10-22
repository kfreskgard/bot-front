import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig, parseConfig } from '../src/config';

const secret = Buffer.alloc(32, 7).toString('base64');
const valid = () => ({
  domain: 'bot.example.com',
  acmeEmail: 'kim@example.com',
  acmeStaging: true,
  tls: true,
  httpPort: 80,
  httpsPort: 443,
  botBackUrl: 'http://bot-back:1234',
  passwordHash: 'scrypt$AQEBAQEBAQEBAQEBAQEBAQ==$AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg==',
  sessionSecret: secret,
});

function rejects(raw: unknown, field: string) {
  assert.throws(
    () => parseConfig(raw),
    (e: unknown) => e instanceof ConfigError && e.message.includes(field) && e.message.startsWith('Invalid config: '),
  );
}

test('a complete valid object parses', () => {
  assert.deepEqual(parseConfig(valid()), valid());
});

test('with tls false, domain, acmeEmail, acmeStaging and httpsPort may be missing', () => {
  const { domain, acmeEmail, acmeStaging, httpsPort, ...rest } = valid();
  const cfg = parseConfig({ ...rest, tls: false });
  assert.equal(cfg.tls, false);
  assert.equal(cfg.domain, '');
  assert.equal(cfg.acmeEmail, '');
  assert.equal(cfg.acmeStaging, false);
  assert.equal(cfg.httpsPort, 443);
});

test('with tls true, the tls fields are required', () => {
  for (const f of ['domain', 'acmeEmail', 'acmeStaging', 'httpsPort']) {
    const raw: Record<string, unknown> = valid();
    delete raw[f];
    rejects(raw, f);
  }
});

test('missing passwordHash', () => {
  const { passwordHash, ...rest } = valid();
  rejects(rest, 'passwordHash');
});

test('passwordHash must be scrypt$<b64>$<b64>', () => {
  rejects({ ...valid(), passwordHash: 'bcrypt$abc$def' }, 'passwordHash');
  rejects({ ...valid(), passwordHash: 'scrypt$abc' }, 'passwordHash');
  const salt = Buffer.alloc(16, 1).toString('base64');
  rejects({ ...valid(), passwordHash: 'scrypt$' + salt + '$' + Buffer.alloc(1, 2).toString('base64') }, 'passwordHash');
  rejects({ ...valid(), passwordHash: 'scrypt$' + Buffer.alloc(8, 1).toString('base64') + '$' + Buffer.alloc(64, 2).toString('base64') }, 'passwordHash');
  const example = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));
  rejects({ ...example, sessionSecret: secret }, 'passwordHash');
});

test('sessionSecret must decode to at least 32 bytes', () => {
  rejects({ ...valid(), sessionSecret: Buffer.alloc(31, 1).toString('base64') }, 'sessionSecret');
});

test('httpPort must be 1..65535', () => {
  rejects({ ...valid(), httpPort: 0 }, 'httpPort');
  rejects({ ...valid(), httpPort: 70000 }, 'httpPort');
});

test('botBackUrl must be an http(s) URL', () => {
  rejects({ ...valid(), botBackUrl: 'bot-back' }, 'botBackUrl');
});

test('tls must be a boolean', () => {
  rejects({ ...valid(), tls: 'yes' }, 'tls');
});

test('a non-object config is rejected', () => {
  assert.throws(() => parseConfig(null), ConfigError);
});

test('loadConfig on a missing file names the path', () => {
  const p = '/no/such/dir/config.json';
  assert.throws(() => loadConfig(p), (e: unknown) => e instanceof ConfigError && e.message.includes(p));
});
