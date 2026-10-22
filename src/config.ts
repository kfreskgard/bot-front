import { readFileSync } from 'node:fs';

export interface Config {
  domain: string;
  acmeEmail: string;
  acmeStaging: boolean;
  tls: boolean;
  httpPort: number;
  httpsPort: number;
  botBackUrl: string;
  passwordHash: string;
  sessionSecret: string;
}

export class ConfigError extends Error {}

const fail = (field: string, reason: string): never => {
  throw new ConfigError(`Invalid config: ${field} ${reason}`);
};

type Obj = Record<string, unknown>;

function str(o: Obj, field: string): string {
  const v = o[field];
  if (typeof v !== 'string' || v === '') return fail(field, 'must be a non-empty string');
  return v;
}

function bool(o: Obj, field: string): boolean {
  const v = o[field];
  if (typeof v !== 'boolean') return fail(field, 'must be true or false');
  return v;
}

function port(o: Obj, field: string): number {
  const v = o[field];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 65535) {
    return fail(field, 'must be an integer from 1 to 65535');
  }
  return v;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function parseConfig(raw: unknown): Config {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('config', 'must be a JSON object');
  }
  const o = raw as Obj;

  const tls = bool(o, 'tls');
  const httpPort = port(o, 'httpPort');

  const botBackUrl = str(o, 'botBackUrl');
  let protocol = '';
  try {
    protocol = new URL(botBackUrl).protocol;
  } catch {
    // handled below
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    fail('botBackUrl', 'must be an http or https URL');
  }

  const passwordHash = str(o, 'passwordHash');
  const parts = passwordHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !B64.test(parts[1]) || !B64.test(parts[2])) {
    fail('passwordHash', 'must have the form scrypt$<base64 salt>$<base64 hash>');
  }

  const sessionSecret = str(o, 'sessionSecret');
  if (!B64.test(sessionSecret) || Buffer.from(sessionSecret, 'base64').length < 32) {
    fail('sessionSecret', 'must be base64 that decodes to at least 32 bytes');
  }

  const base = { tls, httpPort, botBackUrl, passwordHash, sessionSecret };
  if (!tls) {
    return {
      ...base,
      domain: o.domain === undefined ? '' : str(o, 'domain'),
      acmeEmail: o.acmeEmail === undefined ? '' : str(o, 'acmeEmail'),
      acmeStaging: o.acmeStaging === undefined ? false : bool(o, 'acmeStaging'),
      httpsPort: o.httpsPort === undefined ? 443 : port(o, 'httpsPort'),
    };
  }
  return {
    ...base,
    domain: str(o, 'domain'),
    acmeEmail: str(o, 'acmeEmail'),
    acmeStaging: bool(o, 'acmeStaging'),
    httpsPort: port(o, 'httpsPort'),
  };
}

export function loadConfig(path: string = process.env.CONFIG_PATH ?? '/config/config.json'): Config {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new ConfigError(`Invalid config: cannot read ${path}: ${(e as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ConfigError(`Invalid config: ${path} is not valid JSON: ${(e as Error).message}`);
  }
  return parseConfig(raw);
}
