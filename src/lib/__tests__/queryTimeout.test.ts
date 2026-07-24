/**
 * Tests para queryTimeout.ts
 */
import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  withQueryTimeout,
  QueryTimeoutError,
  recommendedTimeout,
  TIMEOUTS,
} from "../queryTimeout.ts";

Deno.test("queryTimeout: TIMEOUTS constants", () => {
  assertEquals(TIMEOUTS.fast, 2_000);
  assertEquals(TIMEOUTS.normal, 8_000);
  assertEquals(TIMEOUTS.slow, 30_000);
  assertEquals(TIMEOUTS.analytics, 120_000);
});

Deno.test("queryTimeout: recommendedTimeout", () => {
  assertEquals(recommendedTimeout('select'), 'normal');
  assertEquals(recommendedTimeout('insert'), 'fast');
  assertEquals(recommendedTimeout('update'), 'fast');
  assertEquals(recommendedTimeout('delete'), 'fast');
  assertEquals(recommendedTimeout('rpc'), 'slow');
});

Deno.test("queryTimeout: withQueryTimeout resolves fast query", async () => {
  const fastQuery = Promise.resolve({ data: { id: 1 }, error: null });
  const result = await withQueryTimeout(fastQuery, 'fast');
  assertEquals(result.data, { id: 1 });
  assertEquals(result.error, null);
});

Deno.test("queryTimeout: withQueryTimeout handles errors gracefully", async () => {
  const failingQuery = Promise.reject(new Error('Database error'));
  await assertRejects(
    () => withQueryTimeout(failingQuery as never, 'fast'),
    Error,
    'Database error'
  );
});

Deno.test("QueryTimeoutError: contains timeout info", () => {
  const error = new QueryTimeoutError(5000);
  assertEquals(error.timeoutMs, 5000);
  assertEquals(error.name, 'QueryTimeoutError');
  assertExists(error.message);
});
