/**
 * Tests para clientRateLimiter.ts (convertido de Deno → vitest)
 */
import { describe, it, expect } from 'vitest';

import {
  clientRateLimiter,
  withRateLimit,
  RateLimitError,
} from '../clientRateLimiter';

describe('clientRateLimiter', () => {
  it('default rules exist', () => {
    const stats = clientRateLimiter.getStats();
    expect(typeof stats.send_message).toBe('object');
    expect(typeof stats.create_contact).toBe('object');
  });

  it('tryAcquire allows within limit', () => {
    clientRateLimiter.resetAll();
    const result = clientRateLimiter.tryAcquire('test_action_1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('tryAcquire blocks after limit', () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_action_2', 3, 60_000);

    // First 3 calls should succeed
    expect(clientRateLimiter.tryAcquire('test_action_2').allowed).toBe(true);
    expect(clientRateLimiter.tryAcquire('test_action_2').allowed).toBe(true);
    expect(clientRateLimiter.tryAcquire('test_action_2').allowed).toBe(true);

    // 4th call should be blocked
    const blocked = clientRateLimiter.tryAcquire('test_action_2');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('reset clears counter', () => {
    clientRateLimiter.setRule('test_action_3', 1, 60_000);

    clientRateLimiter.tryAcquire('test_action_3');
    expect(clientRateLimiter.tryAcquire('test_action_3').allowed).toBe(false);

    clientRateLimiter.reset('test_action_3');
    expect(clientRateLimiter.tryAcquire('test_action_3').allowed).toBe(true);
  });

  it('resetAll clears everything', () => {
    clientRateLimiter.setRule('test_a', 1, 60_000);
    clientRateLimiter.setRule('test_b', 1, 60_000);

    clientRateLimiter.tryAcquire('test_a');
    clientRateLimiter.tryAcquire('test_b');

    clientRateLimiter.resetAll();

    expect(clientRateLimiter.tryAcquire('test_a').allowed).toBe(true);
    expect(clientRateLimiter.tryAcquire('test_b').allowed).toBe(true);
  });

  it('getStats returns correct counts', () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_stats', 5, 60_000);

    clientRateLimiter.tryAcquire('test_stats');
    clientRateLimiter.tryAcquire('test_stats');
    clientRateLimiter.tryAcquire('test_stats');

    const stats = clientRateLimiter.getStats();
    expect(stats.test_stats.used).toBe(3);
    expect(stats.test_stats.limit).toBe(5);
    expect(stats.test_stats.remaining).toBe(2);
  });

  it('RateLimitError contains retry info', () => {
    const error = new RateLimitError('test', 'test_action', 5000);
    expect(error.action).toBe('test_action');
    expect(error.retryAfterMs).toBe(5000);
    expect(error.name).toBe('RateLimitError');
  });

  it('withRateLimit wraps function and applies limit', async () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_wrap', 2, 60_000);

    let callCount = 0;
    const wrapped = withRateLimit('test_wrap', async (n: number) => {
      callCount++;
      return n * 2;
    });

    // First 2 should succeed
    const r1 = await wrapped(1);
    expect(r1).toBe(2);
    const r2 = await wrapped(2);
    expect(r2).toBe(4);

    // 3rd should throw
    await expect(wrapped(3)).rejects.toBeInstanceOf(RateLimitError);

    expect(callCount).toBe(2); // Only 2 actual calls
  });

  it('withRateLimit preserves function arguments', async () => {
    clientRateLimiter.resetAll();
    clientRateLimiter.setRule('test_args', 100, 60_000);

    const wrapped = withRateLimit('test_args', async (a: string, b: number) => {
      return `${a}-${b}`;
    });

    const result = await wrapped('hello', 42);
    expect(result).toBe('hello-42');
  });

  it('window-based reset', async () => {
    clientRateLimiter.resetAll();
    // Set very short window for testing
    clientRateLimiter.setRule('test_window', 1, 100); // 1 call per 100ms

    expect(clientRateLimiter.tryAcquire('test_window').allowed).toBe(true);
    expect(clientRateLimiter.tryAcquire('test_window').allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));

    // Should be allowed again
    expect(clientRateLimiter.tryAcquire('test_window').allowed).toBe(true);
  });
});
