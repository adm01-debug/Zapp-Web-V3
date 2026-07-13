/**
 * Tests for useInViewport().
 *
 * IntersectionObserver is mocked with a class stub so it can be used with
 * `new`. Fake timers are applied only in sticky-timeout tests to avoid
 * conflicting with React's internal scheduler.
 *
 * Covered:
 *   - Returns false by default (no intersection)
 *   - Returns true when an intersecting entry fires
 *   - Returns false immediately when keepVisibleMs=0 and element leaves
 *   - Sticky timeout: stays true for keepVisibleMs after leaving viewport
 *   - Becomes false after keepVisibleMs elapses
 *   - Sticky timer cancelled when element re-enters viewport
 *   - disabled=true: returns false and never creates an observer
 *   - SSR fallback: returns false when IntersectionObserver is undefined
 *   - Cleans up (disconnect) on unmount
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInViewport } from '../useInViewport';

// ── IntersectionObserver mock ──────────────────────────────────────────────────
type IOCallback = (entries: IntersectionObserverEntry[]) => void;

let latestCallback: IOCallback | null = null;
let mockDisconnect: ReturnType<typeof vi.fn>;
let mockObserve: ReturnType<typeof vi.fn>;

function installMockIO() {
  mockDisconnect = vi.fn();
  mockObserve = vi.fn();
  latestCallback = null;

  class MockIO {
    constructor(cb: IOCallback) {
      latestCallback = cb;
    }
    observe = mockObserve;
    unobserve = vi.fn();
    disconnect = mockDisconnect;
    takeRecords = vi.fn();
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
  }

  vi.stubGlobal('IntersectionObserver', MockIO);
}

function fireIntersection(isIntersecting: boolean) {
  latestCallback?.([{ isIntersecting } as unknown as IntersectionObserverEntry]);
}

function makeRef() {
  const div = document.createElement('div');
  return { current: div } as React.RefObject<Element>;
}

beforeEach(() => {
  installMockIO();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── baseline ───────────────────────────────────────────────────────────────────
describe('useInViewport — baseline', () => {
  it('returns false initially (no intersection fired)', () => {
    const { result } = renderHook(() => useInViewport(makeRef()));
    expect(result.current).toBe(false);
  });

  it('returns true when an intersecting entry fires', () => {
    const { result } = renderHook(() => useInViewport(makeRef()));
    act(() => fireIntersection(true));
    expect(result.current).toBe(true);
  });

  it('returns false immediately when keepVisibleMs=0 and element leaves', () => {
    const { result } = renderHook(() => useInViewport(makeRef(), { keepVisibleMs: 0 }));
    act(() => fireIntersection(true));
    act(() => fireIntersection(false));
    expect(result.current).toBe(false);
  });
});

// ── sticky timeout ─────────────────────────────────────────────────────────────
describe('useInViewport — sticky timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays true during keepVisibleMs after leaving viewport', () => {
    const { result } = renderHook(() => useInViewport(makeRef(), { keepVisibleMs: 500 }));
    act(() => fireIntersection(true));
    act(() => fireIntersection(false));
    expect(result.current).toBe(true);
  });

  it('becomes false after keepVisibleMs elapses', () => {
    const { result } = renderHook(() => useInViewport(makeRef(), { keepVisibleMs: 500 }));
    act(() => fireIntersection(true));
    act(() => fireIntersection(false));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(false);
  });

  it('cancels the sticky timer when element re-enters viewport', () => {
    const { result } = renderHook(() => useInViewport(makeRef(), { keepVisibleMs: 500 }));
    act(() => fireIntersection(true));
    act(() => fireIntersection(false));
    act(() => {
      vi.advanceTimersByTime(200);
      fireIntersection(true);
    });
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe(true);
  });
});

// ── disabled option ────────────────────────────────────────────────────────────
describe('useInViewport — disabled', () => {
  it('returns false and never instantiates an observer when disabled=true', () => {
    // Count constructor calls via a spy on the global
    const ctorSpy = vi.spyOn(globalThis, 'IntersectionObserver' as never);
    const { result } = renderHook(() => useInViewport(makeRef(), { disabled: true }));
    expect(result.current).toBe(false);
    expect(ctorSpy).not.toHaveBeenCalled();
  });
});

// ── SSR fallback ───────────────────────────────────────────────────────────────
describe('useInViewport — SSR fallback', () => {
  it('returns false when IntersectionObserver is not defined', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useInViewport(makeRef()));
    expect(result.current).toBe(false);
  });
});

// ── cleanup ────────────────────────────────────────────────────────────────────
describe('useInViewport — cleanup', () => {
  it('calls observer.disconnect() on unmount', () => {
    const { unmount } = renderHook(() => useInViewport(makeRef()));
    unmount();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
