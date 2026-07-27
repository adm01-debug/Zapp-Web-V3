/**
 * Tests para clientRateLimiter.ts
 */
import { describe, it, expect } from 'vitest';

import {
  clientRateLimiter,
  withRateLimit,
  RateLimitError,
} from "../clientRateLimiter";

describe('clientRateLimiter', () => {
  it('default rules exist', () => {
    const stats = clientRateLimiter.getStats();
    expect(typeof stats.send_message).toEqual('object');
    expect(typeof stats.create_contact).toEqual('object');
  });

  it('tryAcquire allows within limit', () => {
    clientRateLimiter.resetAll();
    const result = clientRateLimiter.tryAcquire('test_action_1');
    expect(result.allowed).toEqual(true);
    expect(result.remaining >= 0).toEqual(true);
  });

  it('tryAcquire blocks after limit', () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_action_2', 3, 60_000);

    expect(clientRateLimiter.tryAcquire('test_action_2').allowed).toEqual(true);
    expect(clientRateLimiter.tryAcquire('test_action_2').allowed).toEqual(true);
    expect(clientRateLimiter.tryAcquire('test_action_2').allowed).toEqual(true);

    const blocked = clientRateLimiter.tryAcquire('test_action_2');
    expect(blocked.allowed).toEqual(false);
    expect(blocked.remaining).toEqual(0);
  });

  it('reset clears counter', () => {
    clientRateLimiter.setRule('test_action_3', 1, 60_000);

    clientRateLimiter.tryAcquire('test_action_3');
    expect(clientRateLimiter.tryAcquire('test_action_3').allowed).toEqual(false);

    clientRateLimiter.reset('test_action_3');
    expect(clientRateLimiter.tryAcquire('test_action_3').allowed).toEqual(true);
  });

  it('resetAll clears everything', () => {
    clientRateLimiter.setRule('test_a', 1, 60_000);
    clientRateLimiter.setRule('test_b', 1, 60_000);

    clientRateLimiter.tryAcquire('test_a');
    clientRateLimiter.tryAcquire('test_b');

    clientRateLimiter.resetAll();

    expect(clientRateLimiter.tryAcquire('test_a').allowed).toEqual(true);
    expect(clientRateLimiter.tryAcquire('test_b').allowed).toEqual(true);
  });

  it('getStats returns correct counts', () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_stats', 5, 60_000);

    clientRateLimiter.tryAcquire('test_stats');
    clientRateLimiter.tryAcquire('test_stats');
    clientRateLimiter.tryAcquire('test_stats');

    const stats = clientRateLimiter.getStats();
    expect(stats.test_stats.used).toEqual(3);
    expect(stats.test_stats.limit).toEqual(5);
    expect(stats.test_stats.remaining).toEqual(2);
  });
});

describe('RateLimitError', () => {
  it('contains retry info', () => {
    const error = new RateLimitError('test', 'test_action', 5000);
    expect(error.action).toEqual('test_action');
    expect(error.retryAfterMs).toEqual(5000);
    expect(error.name).toEqual('RateLimitError');
  });
});

describe('withRateLimit', () => {
  it('wraps function and applies limit', async () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_wrap', 2, 60_000);

    let callCount = 0;
    const wrapped = withRateLimit('test_wrap', async (n: number) => {
      callCount++;
      return n * 2;
    });

    const r1 = await wrapped(1);
    expect(r1).toEqual(2);
    const r2 = await wrapped(2);
    expect(r2).toEqual(4);

    await expect(wrapped(3)).rejects.toBeInstanceOf(RateLimitError);

    expect(callCount).toEqual(2);
  });

  it('preserves function arguments', async () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_args', 100, 60_000);

    const wrapped = withRateLimit('test_args', async (a: string, b: number) => {
      return `${a}-${b}`;
    });

    const result = await wrapped('hello', 42);
    expect(result).toEqual('hello-42');
  });

  it('window-based reset', async () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_window', 1, 100);

    expect(clientRateLimiter.tryAcquire('test_window').allowed).toEqual(true);
    expect(clientRateLimiter.tryAcquire('test_window').allowed).toEqual(false);

    await new Promise((r) => setTimeout(r, 150));

    expect(clientRateLimiter.tryAcquire('test_window').allowed).toEqual(true);
  });
});
