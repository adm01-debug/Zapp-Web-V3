/**
 * Tests para clientRateLimiter.ts
 */
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  clientRateLimiter,
  withRateLimit,
  RateLimitError,
} from "../clientRateLimiter.ts";

Deno.test("clientRateLimiter: default rules exist", () => {
  const stats = clientRateLimiter.getStats();
  assertEquals(typeof stats.send_message, 'object');
  assertEquals(typeof stats.create_contact, 'object');
});

Deno.test("clientRateLimiter: tryAcquire allows within limit", () => {
  clientRateLimiter.resetAll();
  const result = clientRateLimiter.tryAcquire('test_action_1');
  assertEquals(result.allowed, true);
  assertEquals(result.remaining >= 0, true);
});

Deno.test("clientRateLimiter: tryAcquire blocks after limit", () => {
  clientRateLimiter.resetAll();
  clientRateLimiter.setRule('test_action_2', 3, 60_000);

  // First 3 calls should succeed
  assertEquals(clientRateLimiter.tryAcquire('test_action_2').allowed, true);
  assertEquals(clientRateLimiter.tryAcquire('test_action_2').allowed, true);
  assertEquals(clientRateLimiter.tryAcquire('test_action_2').allowed, true);

  // 4th call should be blocked
  const blocked = clientRateLimiter.tryAcquire('test_action_2');
  assertEquals(blocked.allowed, false);
  assertEquals(blocked.remaining, 0);
});

Deno.test("clientRateLimiter: reset clears counter", () => {
  clientRateLimiter.setRule('test_action_3', 1, 60_000);

  clientRateLimiter.tryAcquire('test_action_3');
  assertEquals(clientRateLimiter.tryAcquire('test_action_3').allowed, false);

  clientRateLimiter.reset('test_action_3');
  assertEquals(clientRateLimiter.tryAcquire('test_action_3').allowed, true);
});

Deno.test("clientRateLimiter: resetAll clears everything", () => {
  clientRateLimiter.setRule('test_a', 1, 60_000);
  clientRateLimiter.setRule('test_b', 1, 60_000);

  clientRateLimiter.tryAcquire('test_a');
  clientRateLimiter.tryAcquire('test_b');

  clientRateLimiter.resetAll();

  assertEquals(clientRateLimiter.tryAcquire('test_a').allowed, true);
  assertEquals(clientRateLimiter.tryAcquire('test_b').allowed, true);
});

Deno.test("clientRateLimiter: getStats returns correct counts", () => {
  clientRateLimiter.resetAll();
  clientRateLimiter.setRule('test_stats', 5, 60_000);

  clientRateLimiter.tryAcquire('test_stats');
  clientRateLimiter.tryAcquire('test_stats');
  clientRateLimiter.tryAcquire('test_stats');

  const stats = clientRateLimiter.getStats();
  assertEquals(stats.test_stats.used, 3);
  assertEquals(stats.test_stats.limit, 5);
  assertEquals(stats.test_stats.remaining, 2);
});

Deno.test("RateLimitError: contains retry info", () => {
  const error = new RateLimitError('test', 'test_action', 5000);
  assertEquals(error.action, 'test_action');
  assertEquals(error.retryAfterMs, 5000);
  assertEquals(error.name, 'RateLimitError');
});

Deno.test("withRateLimit: wraps function and applies limit", async () => {
  clientRateLimiter.resetAll();
  clientRateLimiter.setRule('test_wrap', 2, 60_000);

  let callCount = 0;
  const wrapped = withRateLimit('test_wrap', async (n: number) => {
    callCount++;
    return n * 2;
  });

  // First 2 should succeed
  const r1 = await wrapped(1);
  assertEquals(r1, 2);
  const r2 = await wrapped(2);
  assertEquals(r2, 4);

  // 3rd should throw
  await assertThrows(
    async () => await wrapped(3),
    RateLimitError
  );

  assertEquals(callCount, 2); // Only 2 actual calls
});

Deno.test("withRateLimit: preserves function arguments", async () => {
  clientRateLimiter.resetAll();
  clientRateLimiter.setRule('test_args', 100, 60_000);

  const wrapped = withRateLimit('test_args', async (a: string, b: number) => {
    return `${a}-${b}`;
  });

  const result = await wrapped('hello', 42);
  assertEquals(result, 'hello-42');
});

Deno.test("clientRateLimiter: window-based reset", async () => {
  clientRateLimiter.resetAll();
  // Set very short window for testing
  clientRateLimiter.setRule('test_window', 1, 100); // 1 call per 100ms

  assertEquals(clientRateLimiter.tryAcquire('test_window').allowed, true);
  assertEquals(clientRateLimiter.tryAcquire('test_window').allowed, false);

  // Wait for window to expire
  await new Promise((r) => setTimeout(r, 150));

  // Should be allowed again
  assertEquals(clientRateLimiter.tryAcquire('test_window').allowed, true);
});
