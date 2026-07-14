/**
 * Tests for useSwipeGesture().
 *
 * Touch event handlers are called directly with synthetic event objects —
 * no DOM rendering required.
 *
 * Covered:
 *   - Default state: offsetX=0, isSwiping=false, direction=null
 *   - Returns handlers object with onTouchStart/Move/End
 *   - enabled=false: start/move/end are no-ops
 *   - touchStart records the starting position
 *   - touchMove updates offsetX, isSwiping=true when >10px, direction
 *   - touchMove cancels tracking when vertical scroll is dominant (deltaY > 1.5*|deltaX|)
 *   - touchEnd resets state to idle after any swipe
 *   - touchEnd fires onSwipeRight when deltaX > threshold
 *   - touchEnd fires onSwipeLeft when deltaX < -threshold
 *   - touchEnd does NOT fire callbacks when delta is below threshold
 *   - offsetX is clamped to ±threshold * 1.5
 *   - direction is 'right' for positive deltaX, 'left' for negative
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeGesture } from '../useSwipeGesture';

function touchEvent(clientX: number, clientY = 0): React.TouchEvent {
  return {
    touches: [{ clientX, clientY }],
  } as unknown as React.TouchEvent;
}

// ── baseline ───────────────────────────────────────────────────────────────────
describe('useSwipeGesture — baseline', () => {
  it('returns default idle swipeState', () => {
    const { result } = renderHook(() => useSwipeGesture({}));
    expect(result.current.swipeState).toEqual({
      offsetX: 0,
      isSwiping: false,
      direction: null,
    });
  });

  it('returns handlers with onTouchStart, onTouchMove, onTouchEnd', () => {
    const { result } = renderHook(() => useSwipeGesture({}));
    expect(typeof result.current.handlers.onTouchStart).toBe('function');
    expect(typeof result.current.handlers.onTouchMove).toBe('function');
    expect(typeof result.current.handlers.onTouchEnd).toBe('function');
  });
});

// ── enabled=false ──────────────────────────────────────────────────────────────
describe('useSwipeGesture — disabled', () => {
  it('start/move/end are no-ops when enabled=false', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: false, onSwipeLeft, onSwipeRight, threshold: 50 })
    );

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(200));
      result.current.handlers.onTouchEnd();
    });

    expect(result.current.swipeState.isSwiping).toBe(false);
    expect(result.current.swipeState.offsetX).toBe(0);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});

// ── touchMove behavior ─────────────────────────────────────────────────────────
describe('useSwipeGesture — touchMove', () => {
  it('sets isSwiping=true when |deltaX| > 10px', () => {
    const { result } = renderHook(() => useSwipeGesture({}));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(100));
      result.current.handlers.onTouchMove(touchEvent(115));
    });
    expect(result.current.swipeState.isSwiping).toBe(true);
  });

  it('keeps isSwiping=false when |deltaX| <= 10px', () => {
    const { result } = renderHook(() => useSwipeGesture({}));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(100));
      result.current.handlers.onTouchMove(touchEvent(108));
    });
    expect(result.current.swipeState.isSwiping).toBe(false);
  });

  it('sets direction="right" for positive deltaX', () => {
    const { result } = renderHook(() => useSwipeGesture({}));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(50));
      result.current.handlers.onTouchMove(touchEvent(100));
    });
    expect(result.current.swipeState.direction).toBe('right');
  });

  it('sets direction="left" for negative deltaX', () => {
    const { result } = renderHook(() => useSwipeGesture({}));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(100));
      result.current.handlers.onTouchMove(touchEvent(50));
    });
    expect(result.current.swipeState.direction).toBe('left');
  });

  it('cancels tracking when vertical scroll is dominant (|deltaY| > 1.5*|deltaX|)', () => {
    const { result } = renderHook(() => useSwipeGesture({}));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(100, 100));
      // deltaX=20, deltaY=100 → vertical dominant
      result.current.handlers.onTouchMove(touchEvent(120, 200));
    });
    expect(result.current.swipeState.isSwiping).toBe(false);
    expect(result.current.swipeState.offsetX).toBe(0);
  });

  it('clamps offsetX to threshold * 1.5 on large rightward swipe', () => {
    const { result } = renderHook(() => useSwipeGesture({ threshold: 80 }));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
      // deltaX=500 → clamped to 80 * 1.5 = 120
      result.current.handlers.onTouchMove(touchEvent(500));
    });
    expect(result.current.swipeState.offsetX).toBe(120);
  });

  it('clamps offsetX to -threshold * 1.5 on large leftward swipe', () => {
    const { result } = renderHook(() => useSwipeGesture({ threshold: 80 }));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(500));
      // deltaX=-500 → clamped to -120
      result.current.handlers.onTouchMove(touchEvent(0));
    });
    expect(result.current.swipeState.offsetX).toBe(-120);
  });
});

// ── touchEnd callbacks ─────────────────────────────────────────────────────────
describe('useSwipeGesture — touchEnd callbacks', () => {
  it('fires onSwipeRight when deltaX > threshold', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeRight, threshold: 80 })
    );
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(100));
      result.current.handlers.onTouchEnd();
    });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('fires onSwipeLeft when deltaX < -threshold', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeLeft, threshold: 80 })
    );
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(200));
      result.current.handlers.onTouchMove(touchEvent(100));
      result.current.handlers.onTouchEnd();
    });
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onSwipeRight when deltaX equals threshold exactly', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeRight, threshold: 80 })
    );
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(80));
      result.current.handlers.onTouchEnd();
    });
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does NOT fire onSwipeLeft when deltaX is above -threshold', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeLeft, threshold: 80 })
    );
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(100));
      result.current.handlers.onTouchMove(touchEvent(30));
      result.current.handlers.onTouchEnd();
    });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('resets swipeState to idle after touchEnd', () => {
    const { result } = renderHook(() => useSwipeGesture({ threshold: 50 }));
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(60));
      result.current.handlers.onTouchEnd();
    });
    expect(result.current.swipeState).toEqual({
      offsetX: 0,
      isSwiping: false,
      direction: null,
    });
  });

  it('touchEnd is no-op if touchStart was never called', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeLeft, onSwipeRight })
    );
    act(() => {
      result.current.handlers.onTouchEnd();
    });
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
