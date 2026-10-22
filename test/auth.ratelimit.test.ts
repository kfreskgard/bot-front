import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoginRateLimiter } from '../src/auth';

const MIN = 60_000;

function setup() {
  let t = 1_000_000;
  const limiter = new LoginRateLimiter(() => t);
  return { limiter, advance: (ms: number) => { t += ms; } };
}

test('4 failures do not lock; the 5th does', () => {
  const { limiter } = setup();
  for (let i = 0; i < 4; i++) limiter.recordFailure('1.1.1.1');
  assert.equal(limiter.isLocked('1.1.1.1'), false);
  limiter.recordFailure('1.1.1.1');
  assert.equal(limiter.isLocked('1.1.1.1'), true);
});

test('lock lasts 15 minutes from the 5th failure', () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 5; i++) limiter.recordFailure('a');
  advance(14 * MIN + 59_000);
  assert.equal(limiter.isLocked('a'), true);
  advance(1_000);
  assert.equal(limiter.isLocked('a'), false);
});

test('failures spread beyond 15 minutes never lock', () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 10; i++) {
    limiter.recordFailure('a');
    assert.equal(limiter.isLocked('a'), false);
    advance(4 * MIN);
  }
});

test('IPs are independent', () => {
  const { limiter } = setup();
  for (let i = 0; i < 5; i++) limiter.recordFailure('a');
  assert.equal(limiter.isLocked('a'), true);
  assert.equal(limiter.isLocked('b'), false);
});

test('recordSuccess resets the count', () => {
  const { limiter } = setup();
  for (let i = 0; i < 4; i++) limiter.recordFailure('a');
  limiter.recordSuccess('a');
  for (let i = 0; i < 4; i++) limiter.recordFailure('a');
  assert.equal(limiter.isLocked('a'), false);
});
