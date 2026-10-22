import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await scryptAsync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

export class LoginRateLimiter {
  private failures = new Map<string, number[]>();
  private lockedUntil = new Map<string, number>();

  constructor(private now: () => number = Date.now) {}

  isLocked(ip: string): boolean {
    const until = this.lockedUntil.get(ip);
    if (until === undefined) return false;
    if (this.now() < until) return true;
    this.lockedUntil.delete(ip);
    return false;
  }

  recordFailure(ip: string): void {
    const now = this.now();
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    if (recent.length >= MAX_FAILURES) {
      this.lockedUntil.set(ip, now + LOCK_MS);
      this.failures.delete(ip);
    } else {
      this.failures.set(ip, recent);
    }
  }

  recordSuccess(ip: string): void {
    this.failures.delete(ip);
    this.lockedUntil.delete(ip);
  }
}
