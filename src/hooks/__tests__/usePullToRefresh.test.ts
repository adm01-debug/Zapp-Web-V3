/**
 * Tests for usePullToRefresh().
 *
 * Touch event handlers are invoked directly with synthetic event objects
 * (no DOM rendering required). The containerRef is populated manually
 * with a mock HTMLDivElement whose scrollTop is set per-test.
 *
 * Covered:
 *   - Returns default idle state: isRefreshing=false, pullDistance=0, pullProgress=0
 *   - Returns handlers: onTouchStart, onTouchMove, onTouchEnd
 *   - disabled=true: all handlers are no-ops
 *   - touchStart does not activate when container.scrollTop > 0
 *   - touchStart activates when container.scrollTop === 0
 *   - touchMove updates pullDistance when pulling is active
 *   - pullDistance is clamped to threshold * 1.5
 *   - pullProgress = min(pullDistance / threshold, 1)
 *   - touchEnd fires onRefresh when pullDistance >= threshold
 *   - touchEnd does NOT fire onRefresh when pullDistance < threshold
 *   - State resets to idle after touchEnd regardless of trigger
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePullToRefresh } from '../usePullToRefresh';

function touchEvent(clientY: number): React.TouchEvent {
  return { touches: [{ clientY }] } as unknown as React.TouchEvent;
}

function mountHookWithContainer(options: Parameters<typeof usePullToRefresh>[0]) {
  const { result } = renderHook(() => usePullToRefresh(options));
  // Attach a mock container with scrollTop = 0
  const mockContainer = { scrollTop: 0 } as HTMLDivElement;
  result.current.containerRef.current = mockContainer;
  return { result, mockContainer };
}

// ── default state ──────────────────────────────────────────────────────────────
describe('usePullToRefresh — default state', () => {
  it('isRefreshing is false by default', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn().mockResolvedValue(undefined) })
    );
    expect(result.current.isRefreshing).toBe(false);
  });

  it('pullDistance is 0 by default', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn().mockResolvedValue(undefined) })
    );
    expect(result.current.pullDistance).toBe(0);
  });

  it('pullProgress is 0 by default', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn().mockResolvedValue(undefined) })
    );
    expect(result.current.pullProgress).toBe(0);
  });

  it('returns onTouchStart, onTouchMove, onTouchEnd handlers', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: vi.fn().mockResolvedValue(undefined) })
    );
    expect(typeof result.current.handlers.onTouchStart).toBe('function');
    expect(typeof result.current.handlers.onTouchMove).toBe('function');
    expect(typeof result.current.handlers.onTouchEnd).toBe('function');
  });
});

// ── disabled ───────────────────────────────────────────────────────────────────
describe('usePullToRefresh — disabled', () => {
  it('handlers are no-ops when disabled=true', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result, mockContainer } = mountHookWithContainer({
      onRefresh,
      threshold: 80,
      disabled: true,
    });

    await act(async () => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(200));
      await result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
    expect(result.current.isRefreshing).toBe(false);
    void mockContainer; // used to satisfy the lint rule
  });
});

// ── touchStart ─────────────────────────────────────────────────────────────────
describe('usePullToRefresh — touchStart', () => {
  it('does not activate pulling when container.scrollTop > 0', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 80 }));
    // Attach container with scrollTop=100 (user has scrolled down)
    result.current.containerRef.current = { scrollTop: 100 } as HTMLDivElement;

    await act(async () => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(200));
      await result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it('activates pulling when container.scrollTop === 0', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    await act(async () => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(100)); // delta=100, distance=50
    });

    expect(result.current.pullDistance).toBeGreaterThan(0);
  });
});

// ── touchMove ─────────────────────────────────────────────────────────────────
describe('usePullToRefresh — touchMove', () => {
  it('sets pullDistance to delta*0.5 for small downward swipe', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(50));
      result.current.handlers.onTouchMove(touchEvent(150)); // delta=100 → distance=50
    });

    expect(result.current.pullDistance).toBe(50);
  });

  it('clamps pullDistance to threshold * 1.5 on very large delta', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
      result.current.handlers.onTouchMove(touchEvent(10000)); // enormous delta → clamped
    });

    expect(result.current.pullDistance).toBe(80 * 1.5);
  });

  it('pullProgress reaches 1 when pullDistance equals threshold', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
      // delta=160 → distance=80 → progress=1
      result.current.handlers.onTouchMove(touchEvent(160));
    });

    expect(result.current.pullProgress).toBe(1);
  });

  it('ignores upward swipe (negative delta)', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(200));
      result.current.handlers.onTouchMove(touchEvent(100)); // delta=-100 → negative, ignored
    });

    expect(result.current.pullDistance).toBe(0);
  });
});

// ── touchEnd → onRefresh ───────────────────────────────────────────────────────
describe('usePullToRefresh — touchEnd callbacks', () => {
  it('fires onRefresh when pullDistance >= threshold', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    // Each step runs in its own act so React re-renders between calls,
    // ensuring handleTouchEnd captures the latest pullDistance from its closure.
    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
    });
    act(() => {
      result.current.handlers.onTouchMove(touchEvent(200));
    }); // distance=100
    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onRefresh when pullDistance < threshold', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
    });
    act(() => {
      result.current.handlers.onTouchMove(touchEvent(50));
    }); // distance=25
    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('resets pullDistance to 0 after touchEnd (below threshold)', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
    });
    act(() => {
      result.current.handlers.onTouchMove(touchEvent(50));
    });
    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(result.current.pullDistance).toBe(0);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('resets isRefreshing to false after onRefresh resolves', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    act(() => {
      result.current.handlers.onTouchStart(touchEvent(0));
    });
    act(() => {
      result.current.handlers.onTouchMove(touchEvent(200));
    });
    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it('touchEnd is a no-op when no touchStart was called', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = mountHookWithContainer({ onRefresh, threshold: 80 });

    await act(async () => {
      await result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
