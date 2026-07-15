/**
 * Tests for useRetryOperation().
 *
 * Covered:
 *   - Resolves immediately on first-attempt success
 *   - Retries after transient errors and resolves on a later attempt
 *   - Throws immediately (no retry) for fatal error codes (PGRST116, 23505, etc.)
 *   - Exhausts maxAttempts and then throws the last error
 *   - reset() clears loading/attempt/lastError state
 *   - State transitions (loading, attempt, lastError) are tracked correctly
 *
 * useToast is mocked so no toast UI is rendered.
 * Fake timers prevent real setTimeout delays.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ── Import SUT AFTER mocks ─────────────────────────────────────────────────────
import { useRetryOperation } from '../useRetryOperation';

// ── Setup ──────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── success on first attempt ───────────────────────────────────────────────────
describe('useRetryOperation — first-attempt success', () => {
  it('resolves and returns the value from fn()', async () => {
    const { result } = renderHook(() => useRetryOperation());
    let value: string | undefined;
    await act(async () => {
      value = await result.current.withRetry(async () => 'ok');
    });
    expect(value).toBe('ok');
  });

  it('sets loading=false and attempt=0 after success', async () => {
    const { result } = renderHook(() => useRetryOperation());
    await act(async () => {
      await result.current.withRetry(async () => 'ok');
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.attempt).toBe(0);
    expect(result.current.lastError).toBeNull();
  });
});

// ── fatal errors (no retry) ────────────────────────────────────────────────────
describe('useRetryOperation — fatal error codes', () => {
  const fatalCodes = ['PGRST116', '23505', '23514', 'CONTACT_NOT_FOUND', 'CONFLICT', '401', '403'];

  for (const code of fatalCodes) {
    it(`throws immediately without retrying for code ${code}`, async () => {
      const { result } = renderHook(() => useRetryOperation());
      const fn = vi.fn().mockRejectedValue(new Error(`fatal: ${code} error`));
      await act(async () => {
        await expect(result.current.withRetry(fn)).rejects.toThrow(code);
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  }

  it('sets loading=false immediately after a fatal error', async () => {
    const { result } = renderHook(() => useRetryOperation());
    await act(async () => {
      await expect(
        result.current.withRetry(async () => { throw new Error('PGRST116 not found'); })
      ).rejects.toThrow();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.lastError).toContain('PGRST116');
  });
});

// ── transient retry ────────────────────────────────────────────────────────────
describe('useRetryOperation — transient retry', () => {
  it('succeeds on the second attempt after a transient failure', async () => {
    const { result } = renderHook(() => useRetryOperation(3, 100));
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValue('success');

    let value: string | undefined;
    await act(async () => {
      const promise = result.current.withRetry(fn);
      // Advance fake timers past the retry delay
      await vi.runAllTimersAsync();
      value = await promise;
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(value).toBe('success');
  });

  it('exhausts all attempts and throws on persistent failure (maxAttempts=1)', async () => {
    // With maxAttempts=1 there is no setTimeout delay — the single attempt
    // fails immediately and withRetry throws, no fake-timer wrangling needed.
    const { result } = renderHook(() => useRetryOperation(1, 10));
    const fn = vi.fn().mockImplementation(async () => { throw new Error('persistent error'); });

    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.withRetry(fn);
      } catch (e) {
        thrown = e as Error;
      }
    });
    expect(thrown?.message).toContain('persistent error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sets lastError after a single-attempt failure', async () => {
    const { result } = renderHook(() => useRetryOperation(1, 10));
    const fn = vi.fn().mockImplementation(async () => { throw new Error('nope'); });

    await act(async () => {
      try {
        await result.current.withRetry(fn);
      } catch {
        // expected
      }
    });
    expect(result.current.lastError).toContain('nope');
    expect(result.current.loading).toBe(false);
  });
});

// ── reset ──────────────────────────────────────────────────────────────────────
describe('useRetryOperation — reset()', () => {
  it('clears loading, attempt, and lastError', async () => {
    const { result } = renderHook(() => useRetryOperation(1, 10));
    await act(async () => {
      try {
        await result.current.withRetry(async () => { throw new Error('PGRST116 err'); });
      } catch {
        // expected: fatal error, throws immediately
      }
    });
    expect(result.current.lastError).not.toBeNull();

    act(() => result.current.reset());
    expect(result.current.loading).toBe(false);
    expect(result.current.attempt).toBe(0);
    expect(result.current.lastError).toBeNull();
  });
});