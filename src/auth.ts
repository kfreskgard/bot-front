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
const SWEEP_AT = 1000;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_TRACKED = 10_000;

export class LoginRateLimiter {
  // Map iteration order is insertion order; failures are re-inserted on update so the oldest come first.
  private failures = new Map<string, number[]>();
  private lockedUntil = new Map<string, number>();
  private nextSweep = 0;

  constructor(private now: () => number = Date.now) {}

  /** Number of IPs currently tracked (failure lists plus locks). */
  get size(): number {
    return this.failures.size + this.lockedUntil.size;
  }

  isLocked(ip: string): boolean {
    const until = this.lockedUntil.get(ip);
    if (until === undefined) return false;
    if (this.now() < until) return true;
    this.lockedUntil.delete(ip);
    return false;
  }

  recordFailure(ip: string): void {
    if (this.isLocked(ip)) return;
    const now = this.now();
    this.sweep(now);
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    this.failures.delete(ip);
    if (recent.length >= MAX_FAILURES) {
      this.lockedUntil.set(ip, now + LOCK_MS);
    } else {
      this.failures.set(ip, recent);
    }
    this.enforceCap();
  }

  recordSuccess(ip: string): void {
    this.failures.delete(ip);
    this.lockedUntil.delete(ip);
  }

  private sweep(now: number): void {
    if (this.size < SWEEP_AT || now < this.nextSweep) return;
    this.nextSweep = now + SWEEP_INTERVAL_MS;
    for (const [ip, list] of this.failures) {
      if (now - list[list.length - 1] >= WINDOW_MS) this.failures.delete(ip);
    }
    for (const [ip, until] of this.lockedUntil) {
      if (until <= now) this.lockedUntil.delete(ip);
    }
  }

  private enforceCap(): void {
    while (this.size > MAX_TRACKED) {
      const oldest = this.failures.keys().next();
      if (!oldest.done) {
        this.failures.delete(oldest.value);
        continue;
      }
      const oldestLock = this.lockedUntil.keys().next();
      if (oldestLock.done) return;
      this.lockedUntil.delete(oldestLock.value);
    }
  }
}
