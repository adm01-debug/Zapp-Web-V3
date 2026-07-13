/**
 * Tests for useSendThrottle().
 *
 * The hook tracks send timestamps via refs and exposes canSend() /
 * recordSend() / throttledSend() / reset(). vi.useFakeTimers() controls
 * Date.now() so timing assertions are deterministic.
 *
 * Covered:
 *   - canSend() is true initially (no sends recorded)
 *   - canSend() is false immediately after recordSend() (minInterval not elapsed)
 *   - canSend() is true once minInterval has elapsed
 *   - canSend() is false when burst limit is reached within the burst window
 *   - canSend() is true again after the burst window expires
 *   - throttledSend() invokes the wrapped function when canSend is true
 *   - throttledSend() forwards the return value of the wrapped function
 *   - throttledSend() returns undefined and does NOT call the function when throttled
 *   - throttledSend() records the send timestamp on success (subsequent call is blocked)
 *   - reset() clears both the lastSend timestamp and the burst window history
 *   - Custom minIntervalMs, burstLimit, and burstWindowMs are respected
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSendThrottle } from '../useSendThrottle';

const EPOCH = 1_000_000; // arbitrary starting timestamp

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── initial state ──────────────────────────────────────────────────────────────
describe('useSendThrottle — initial state', () => {
  it('canSend() returns true before any send has been recorded', () => {
    const { result } = renderHook(() => useSendThrottle());
    expect(result.current.canSend()).toBe(true);
  });
});

// ── minInterval ────────────────────────────────────────────────────────────────
describe('useSendThrottle — minInterval', () => {
  it('canSend() returns false immediately after recordSend()', () => {
    const { result } = renderHook(() => useSendThrottle({ minIntervalMs: 500 }));
    act(() => { result.current.recordSend(); });
    expect(result.current.canSend()).toBe(false);
  });

  it('canSend() returns true once minInterval has elapsed', () => {
    const { result } = renderHook(() => useSendThrottle({ minIntervalMs: 500 }));
    act(() => { result.current.recordSend(); });
    // Advance past the min interval
    vi.setSystemTime(EPOCH + 501);
    expect(result.current.canSend()).toBe(true);
  });

  it('canSend() returns false just before minInterval expires', () => {
    const { result } = renderHook(() => useSendThrottle({ minIntervalMs: 500 }));
    act(() => { result.current.recordSend(); });
    vi.setSystemTime(EPOCH + 499);
    expect(result.current.canSend()).toBe(false);
  });

  it('respects a custom minIntervalMs', () => {
    const { result } = renderHook(() => useSendThrottle({ minIntervalMs: 200 }));
    act(() => { result.current.recordSend(); });
    vi.setSystemTime(EPOCH + 201);
    expect(result.current.canSend()).toBe(true);
  });
});

// ── burst limit ────────────────────────────────────────────────────────────────
describe('useSendThrottle — burst limit', () => {
  it('canSend() returns false when burst limit is reached within the window', () => {
    const { result } = renderHook(() =>
      useSendThrottle({ minIntervalMs: 0, burstLimit: 3, burstWindowMs: 1000 })
    );

    act(() => {
      result.current.recordSend();
      vi.setSystemTime(EPOCH + 100);
      result.current.recordSend();
      vi.setSystemTime(EPOCH + 200);
      result.current.recordSend();
    });

    // 3 sends in 200ms (within 1000ms window) — burst limit reached
    expect(result.current.canSend()).toBe(false);
  });

  it('canSend() returns true after the burst window expires', () => {
    const { result } = renderHook(() =>
      useSendThrottle({ minIntervalMs: 0, burstLimit: 3, burstWindowMs: 1000 })
    );

    act(() => {
      result.current.recordSend();
      vi.setSystemTime(EPOCH + 100);
      result.current.recordSend();
      vi.setSystemTime(EPOCH + 200);
      result.current.recordSend();
    });

    // Advance past the burst window so all timestamps expire
    vi.setSystemTime(EPOCH + 1201);
    expect(result.current.canSend()).toBe(true);
  });

  it('respects a custom burstLimit', () => {
    const { result } = renderHook(() =>
      useSendThrottle({ minIntervalMs: 0, burstLimit: 2, burstWindowMs: 5000 })
    );

    act(() => {
      result.current.recordSend();
      vi.setSystemTime(EPOCH + 100);
      result.current.recordSend();
    });

    // 2 sends = limit reached
    expect(result.current.canSend()).toBe(false);
  });
});

// ── throttledSend ──────────────────────────────────────────────────────────────
describe('useSendThrottle — throttledSend', () => {
  it('calls the wrapped function and returns its value when allowed', () => {
    const { result } = renderHook(() => useSendThrottle());
    const fn = vi.fn().mockReturnValue('hello');
    const wrapped = result.current.throttledSend(fn);

    const ret = wrapped('arg');

    expect(fn).toHaveBeenCalledWith('arg');
    expect(ret).toBe('hello');
  });

  it('returns undefined and does NOT call the function when throttled', () => {
    const { result } = renderHook(() => useSendThrottle({ minIntervalMs: 500 }));
    const fn = vi.fn();

    // First call goes through (records send)
    act(() => { result.current.throttledSend(fn)(); });
    fn.mockClear();

    // Immediately after → throttled
    const ret = result.current.throttledSend(fn)();
    expect(fn).not.toHaveBeenCalled();
    expect(ret).toBeUndefined();
  });

  it('records the send so the subsequent immediate call is blocked', () => {
    const { result } = renderHook(() => useSendThrottle({ minIntervalMs: 500 }));
    const fn = vi.fn();

    result.current.throttledSend(fn)();

    // Verify canSend is now false (throttledSend recorded the send)
    expect(result.current.canSend()).toBe(false);
  });
});

// ── reset ──────────────────────────────────────────────────────────────────────
describe('useSendThrottle — reset', () => {
  it('reset() allows canSend() immediately after a recent send', () => {
    const { result } = renderHook(() => useSendThrottle({ minIntervalMs: 500 }));
    act(() => { result.current.recordSend(); });

    // Without reset, canSend would be false
    expect(result.current.canSend()).toBe(false);

    act(() => { result.current.reset(); });

    expect(result.current.canSend()).toBe(true);
  });

  it('reset() clears burst window history', () => {
    const { result } = renderHook(() =>
      useSendThrottle({ minIntervalMs: 0, burstLimit: 2, burstWindowMs: 5000 })
    );

    act(() => {
      result.current.recordSend();
      vi.setSystemTime(EPOCH + 100);
      result.current.recordSend();
    });

    expect(result.current.canSend()).toBe(false);

    act(() => { result.current.reset(); });

    expect(result.current.canSend()).toBe(true);
  });
});
