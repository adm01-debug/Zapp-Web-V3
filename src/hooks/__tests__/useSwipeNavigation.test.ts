// @ts-nocheck
/**
 * Tests for useSwipeNavigation().
 *
 * Touch events are dispatched on document so the useEffect listeners
 * are exercised. vi.useFakeTimers() controls Date.now() for flick timing.
 * window.innerWidth is stubbed to 375px (mobile) so right-edge detection
 * works correctly.
 *
 * Covered:
 *   - enabled=false: no callbacks fire
 *   - canGoBack=false: left-edge touch has no effect
 *   - canGoBack=true + left-edge + threshold swipe → onSwipeBack
 *   - canGoBack=true + left-edge + fast flick (< 300ms, > 30px) → onSwipeBack
 *   - canGoForward=true + right-edge + leftward threshold swipe → onSwipeForward
 *   - Vertical scroll cancels the in-progress swipe
 *   - Cleans up event listeners on unmount (no callbacks after unmount)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSwipeNavigation } from '../useSwipeNavigation';

const SCREEN_W = 375;
const EDGE = 24;
const THRESHOLD = 80;

function fireTouch(type: 'touchstart' | 'touchmove' | 'touchend', x: number, y = 0) {
  const touch = { clientX: x, clientY: y } as unknown as Touch;
  // happy-dom supports TouchEvent
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type !== 'touchend' ? [touch] : [],
    changedTouches: [touch],
  });
  document.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('innerWidth', SCREEN_W);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.querySelectorAll('.swipe-nav-indicator').forEach((el) => el.remove());
});

// ── enabled=false ──────────────────────────────────────────────────────────────
describe('useSwipeNavigation — disabled', () => {
  it('does not fire onSwipeBack when enabled=false', () => {
    const onSwipeBack = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({ enabled: false, onSwipeBack, canGoBack: true, threshold: THRESHOLD })
    );
    fireTouch('touchstart', 10);
    fireTouch('touchmove', 100);
    fireTouch('touchend', 100);
    expect(onSwipeBack).not.toHaveBeenCalled();
    unmount();
  });
});

// ── canGoBack guard ────────────────────────────────────────────────────────────
describe('useSwipeNavigation — canGoBack guard', () => {
  it('does not fire onSwipeBack when canGoBack=false (even from left edge)', () => {
    const onSwipeBack = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({ onSwipeBack, canGoBack: false, threshold: THRESHOLD, edgeWidth: EDGE })
    );
    fireTouch('touchstart', 10);        // within left edge
    fireTouch('touchmove', 10 + 100);   // rightward, large delta
    vi.advanceTimersByTime(100);
    fireTouch('touchend', 10 + 100);
    expect(onSwipeBack).not.toHaveBeenCalled();
    unmount();
  });
});

// ── left-edge swipe → onSwipeBack ─────────────────────────────────────────────
describe('useSwipeNavigation — onSwipeBack', () => {
  it('fires onSwipeBack after a threshold-crossing left-edge swipe', () => {
    const onSwipeBack = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({
        onSwipeBack,
        canGoBack: true,
        threshold: THRESHOLD,
        edgeWidth: EDGE,
      })
    );
    fireTouch('touchstart', 10);            // left edge (10 <= 24)
    fireTouch('touchmove', 10 + THRESHOLD + 1); // dx > threshold
    // elapsed > 300ms (not a flick) but delta >= threshold → isSwipe
    vi.advanceTimersByTime(400);
    fireTouch('touchend', 10 + THRESHOLD + 1);
    expect(onSwipeBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('fires onSwipeBack on a fast flick (elapsed < 300ms, dx > 30px)', () => {
    const onSwipeBack = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({
        onSwipeBack,
        canGoBack: true,
        threshold: THRESHOLD,
        edgeWidth: EDGE,
      })
    );
    fireTouch('touchstart', 10);
    fireTouch('touchmove', 10 + 50);   // dx=50 > 30px
    vi.advanceTimersByTime(100);       // elapsed = 100ms < 300ms → flick
    fireTouch('touchend', 10 + 50);
    expect(onSwipeBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does NOT fire onSwipeBack when swipe starts outside left edge', () => {
    const onSwipeBack = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({
        onSwipeBack,
        canGoBack: true,
        threshold: THRESHOLD,
        edgeWidth: EDGE,
      })
    );
    fireTouch('touchstart', 50);            // 50 > edgeWidth=24
    fireTouch('touchmove', 50 + THRESHOLD + 1);
    vi.advanceTimersByTime(400);
    fireTouch('touchend', 50 + THRESHOLD + 1);
    expect(onSwipeBack).not.toHaveBeenCalled();
    unmount();
  });
});

// ── right-edge swipe → onSwipeForward ─────────────────────────────────────────
describe('useSwipeNavigation — onSwipeForward', () => {
  it('fires onSwipeForward after a threshold-crossing right-edge leftward swipe', () => {
    const onSwipeForward = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({
        onSwipeForward,
        canGoForward: true,
        threshold: THRESHOLD,
        edgeWidth: EDGE,
      })
    );
    const startX = SCREEN_W - 10; // right edge (>= 375 - 24 = 351)
    fireTouch('touchstart', startX);
    fireTouch('touchmove', startX - THRESHOLD - 1); // dx < -threshold
    vi.advanceTimersByTime(400);
    fireTouch('touchend', startX - THRESHOLD - 1);
    expect(onSwipeForward).toHaveBeenCalledTimes(1);
    unmount();
  });
});

// ── vertical scroll cancels ────────────────────────────────────────────────────
describe('useSwipeNavigation — vertical scroll cancels', () => {
  it('cancels swipe when |deltaY| > 1.5 * |deltaX|', () => {
    const onSwipeBack = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({
        onSwipeBack,
        canGoBack: true,
        threshold: THRESHOLD,
        edgeWidth: EDGE,
      })
    );
    fireTouch('touchstart', 10, 100);
    // deltaX=20, deltaY=100 → vertical dominant
    fireTouch('touchmove', 30, 200);
    vi.advanceTimersByTime(50);
    fireTouch('touchend', 30);
    expect(onSwipeBack).not.toHaveBeenCalled();
    unmount();
  });
});

// ── cleanup ────────────────────────────────────────────────────────────────────
describe('useSwipeNavigation — cleanup', () => {
  it('does not fire callbacks after unmount', () => {
    const onSwipeBack = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation({
        onSwipeBack,
        canGoBack: true,
        threshold: THRESHOLD,
        edgeWidth: EDGE,
      })
    );
    unmount();
    fireTouch('touchstart', 10);
    fireTouch('touchmove', 10 + THRESHOLD + 1);
    vi.advanceTimersByTime(400);
    fireTouch('touchend', 10 + THRESHOLD + 1);
    expect(onSwipeBack).not.toHaveBeenCalled();
  });
});
