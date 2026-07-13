/**
 * Tests for useKeyboardHeight().
 *
 * The hook uses window.visualViewport to compute keyboard height as
 * (innerHeight - viewport.height). It registers 'resize' and 'scroll'
 * handlers on the viewport and removes them on unmount.
 *
 * A minimal VisualViewport stub is created and assigned via
 * vi.stubGlobal('visualViewport', ...) so real browser APIs are never
 * needed. vi.stubGlobal('innerHeight', ...) controls the window height.
 *
 * Covered:
 *   - Default state: keyboardHeight=0, isKeyboardOpen=false
 *   - No-op when visualViewport is absent (undefined)
 *   - keyboardHeight equals innerHeight - viewport.height (when positive)
 *   - keyboardHeight is never negative (Math.max guard)
 *   - isKeyboardOpen becomes true when kbHeight > 50
 *   - isKeyboardOpen is false when kbHeight <= 50
 *   - Resize event triggers recalculation
 *   - Scroll event triggers recalculation
 *   - Event listeners are removed on unmount (no callbacks after unmount)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardHeight } from '../useKeyboardHeight';

type VVListener = () => void;

interface StubViewport extends EventTarget {
  height: number;
  _emit: (type: 'resize' | 'scroll') => void;
}

function makeViewportStub(height: number): StubViewport {
  const listeners: Record<string, VVListener[]> = { resize: [], scroll: [] };
  return {
    height,
    addEventListener(type: string, cb: EventListenerOrEventListenerObject) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb as VVListener);
    },
    removeEventListener(type: string, cb: EventListenerOrEventListenerObject) {
      listeners[type] = (listeners[type] || []).filter((l) => l !== cb);
    },
    dispatchEvent() { return true; },
    _emit(type: 'resize' | 'scroll') {
      (listeners[type] || []).forEach((l) => l());
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('innerHeight', 800);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── default state ──────────────────────────────────────────────────────────────
describe('useKeyboardHeight — default state', () => {
  it('keyboardHeight is 0 when viewport height equals innerHeight', () => {
    const vv = makeViewportStub(800); // height === innerHeight
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());
    expect(result.current.keyboardHeight).toBe(0);
  });

  it('isKeyboardOpen is false by default', () => {
    const vv = makeViewportStub(800);
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());
    expect(result.current.isKeyboardOpen).toBe(false);
  });

  it('starts with keyboardHeight=0 when visualViewport is absent', () => {
    vi.stubGlobal('visualViewport', undefined);
    const { result } = renderHook(() => useKeyboardHeight());
    expect(result.current.keyboardHeight).toBe(0);
    expect(result.current.isKeyboardOpen).toBe(false);
  });
});

// ── keyboardHeight calculation ─────────────────────────────────────────────────
describe('useKeyboardHeight — keyboardHeight', () => {
  it('equals innerHeight - viewport.height when viewport shrinks', () => {
    const vv = makeViewportStub(500); // 800 - 500 = 300
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => { vv._emit('resize'); });

    expect(result.current.keyboardHeight).toBe(300);
  });

  it('is never negative when viewport is taller than innerHeight', () => {
    const vv = makeViewportStub(900); // 800 - 900 = -100 → clamped to 0
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => { vv._emit('resize'); });

    expect(result.current.keyboardHeight).toBe(0);
  });

  it('updates when viewport height changes between emissions', () => {
    const vv = makeViewportStub(800);
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());

    // First event: keyboard opens (300px)
    vv.height = 500;
    act(() => { vv._emit('resize'); });
    expect(result.current.keyboardHeight).toBe(300);

    // Second event: keyboard closes
    vv.height = 800;
    act(() => { vv._emit('resize'); });
    expect(result.current.keyboardHeight).toBe(0);
  });
});

// ── isKeyboardOpen ─────────────────────────────────────────────────────────────
describe('useKeyboardHeight — isKeyboardOpen', () => {
  it('is true when keyboardHeight > 50', () => {
    const vv = makeViewportStub(730); // 800 - 730 = 70 > 50
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => { vv._emit('resize'); });

    expect(result.current.isKeyboardOpen).toBe(true);
  });

  it('is false when keyboardHeight is exactly 50', () => {
    const vv = makeViewportStub(750); // 800 - 750 = 50, NOT > 50
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => { vv._emit('resize'); });

    expect(result.current.isKeyboardOpen).toBe(false);
  });

  it('is false when keyboardHeight < 50', () => {
    const vv = makeViewportStub(775); // 800 - 775 = 25 < 50
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => { vv._emit('resize'); });

    expect(result.current.isKeyboardOpen).toBe(false);
  });
});

// ── scroll event ───────────────────────────────────────────────────────────────
describe('useKeyboardHeight — scroll event', () => {
  it('also recalculates on scroll events', () => {
    const vv = makeViewportStub(600); // 800 - 600 = 200
    vi.stubGlobal('visualViewport', vv);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => { vv._emit('scroll'); });

    expect(result.current.keyboardHeight).toBe(200);
    expect(result.current.isKeyboardOpen).toBe(true);
  });
});

// ── cleanup ────────────────────────────────────────────────────────────────────
describe('useKeyboardHeight — cleanup', () => {
  it('does not update state after unmount', () => {
    const vv = makeViewportStub(800);
    vi.stubGlobal('visualViewport', vv);
    const { result, unmount } = renderHook(() => useKeyboardHeight());
    unmount();

    // Post-unmount emission should not throw or update state
    vv.height = 300;
    act(() => { vv._emit('resize'); });

    // State should remain at default (set before unmount)
    expect(result.current.keyboardHeight).toBe(0);
  });
});
