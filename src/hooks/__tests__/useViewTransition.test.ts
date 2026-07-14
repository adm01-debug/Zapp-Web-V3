// @ts-nocheck
/**
 * Tests for useViewTransition().
 *
 * Two paths:
 *   1. document.startViewTransition not available → callback invoked directly
 *   2. document.startViewTransition available → callback passed through, promise
 *      rejection errors are swallowed (logged at debug level)
 *
 * @/lib/logger is mocked so no real logger is exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { useViewTransition } from '../useViewTransition';

// ── Helpers ───────────────────────────────────────────────────────────────────
type MockTransition = {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
};

function makeMockTransition(opts: Partial<{ rejectAll: boolean }> = {}): MockTransition {
  const make = () =>
    opts.rejectAll
      ? Promise.reject(new DOMException('AbortError'))
      : Promise.resolve();
  return {
    finished: make(),
    ready: make(),
    updateCallbackDone: make(),
  };
}

// ── Fallback path ─────────────────────────────────────────────────────────────
describe('useViewTransition — fallback (no startViewTransition)', () => {
  beforeEach(() => {
    // Ensure API is absent
    delete (document as Document & { startViewTransition?: unknown }).startViewTransition;
  });

  it('calls the callback immediately when startViewTransition is not available', () => {
    const { result } = renderHook(() => useViewTransition());
    const cb = vi.fn();
    act(() => result.current.startTransition(cb));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// ── API path ──────────────────────────────────────────────────────────────────
describe('useViewTransition — with startViewTransition', () => {
  let mockStartViewTransition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockStartViewTransition = vi.fn((cb: () => void) => {
      cb();
      return makeMockTransition();
    });
    (document as Document & { startViewTransition?: unknown }).startViewTransition =
      mockStartViewTransition;
  });

  afterEach(() => {
    delete (document as Document & { startViewTransition?: unknown }).startViewTransition;
  });

  it('delegates to document.startViewTransition when available', () => {
    const { result } = renderHook(() => useViewTransition());
    const cb = vi.fn();
    act(() => result.current.startTransition(cb));
    expect(mockStartViewTransition).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not throw when transition promises reject (AbortError swallowed)', async () => {
    mockStartViewTransition = vi.fn((cb: () => void) => {
      cb();
      return makeMockTransition({ rejectAll: true });
    });
    (document as Document & { startViewTransition?: unknown }).startViewTransition =
      mockStartViewTransition;

    const { result } = renderHook(() => useViewTransition());

    await expect(
      act(async () => {
        result.current.startTransition(() => {});
        // Let microtasks flush so rejection handlers run
        await Promise.resolve();
      })
    ).resolves.not.toThrow();
  });
});
