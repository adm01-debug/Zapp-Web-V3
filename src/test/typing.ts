/**
 * Typing helpers for tests.
 *
 * Eliminates the repetitive `value as unknown as ExpectedType` double-cast
 * pattern when bridging mocks, partial fixtures or `unknown` results to a
 * concrete type. All helpers are zero-runtime — they only narrow at
 * compile-time and return the exact same reference.
 *
 * IMPORTANT: only use in tests. Production code should validate at runtime
 * (Zod, type guards, etc.) instead of asserting.
 */

import type { Mock } from 'vitest';

/**
 * Forcibly narrow `unknown` (or any incompatible type) to `T`.
 *
 * Replaces `value as unknown as T`.
 *
 * @example
 *   const res = asTyped<WebhookResponse>(await fn.invoke(...));
 *   expect(res.signature_valid).toBe(true);
 */
export function asTyped<T>(value: unknown): T {
  return value as T; // ignore-audit: test utility — intentional escape hatch for bridging unknown to T in test fixtures
}

/**
 * Like `asTyped`, but explicit when the source is `unknown`. Reads better
 * at call sites that want to document "this came from a black-box call".
 *
 * @example
 *   const data = fromUnknown<InvokeResponse>(rawInvokeResult);
 */
export function fromUnknown<T>(value: unknown): T {
  return value as T; // ignore-audit: test utility — intentional escape hatch for bridging unknown to T in test fixtures
}

/**
 * Build a partial fixture and present it as a fully-typed `T`. Useful when
 * a component/hook only reads a subset of fields in a given test.
 *
 * @example
 *   const msg = mockOf<Message>({ id: '1', body: 'hi' });
 */
export function mockOf<T>(partial: Partial<T> = {}): T {
  return partial as T; // ignore-audit: test utility — Partial<T> narrowed to T; caller controls which fields are required for the test
}

/**
 * Cast any callable (including a real function replaced via `vi.mock`) to
 * a Vitest `Mock` so `.mockReturnValue`, `.mockResolvedValue` etc. type-check
 * without `(fn as any).mockReturnValue(...)`.
 *
 * @example
 *   asMock(useIsMobile).mockReturnValue(true);
 *   asMock(toast.error).mockClear();
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asMock<T extends (...args: any[]) => any>(fn: T): Mock<T> {
  return fn as unknown as Mock<T>;
}

/**
 * Attach an arbitrary typed bag to `globalThis` / `window` for tests that
 * stash spies or counters on the global. Avoids `(globalThis as any).foo`.
 *
 * @example
 *   const g = globalAs<{ __queryTelemetry?: { total: number } }>();
 *   expect(g.__queryTelemetry?.total).toBe(1);
 */
export function globalAs<T extends object>(): T {
  return globalThis as unknown as T;
}

/** Short alias for `globalAs<{ [k: string]: unknown }>()` when you just need to write a key. */
export function windowAs<T extends object>(): T {
  return (typeof window === 'undefined' ? globalThis : window) as unknown as T;
}
