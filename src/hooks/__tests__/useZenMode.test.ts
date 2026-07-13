/**
 * Tests for useZenMode().
 *
 * Covers initial state from localStorage, toggleZen, exitZen,
 * and the Escape key listener.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useZenMode } from '../useZenMode';

const STORAGE_KEY = 'zen-mode';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ── Initial state ─────────────────────────────────────────────────────────────
describe('useZenMode — initial state', () => {
  it('defaults to false when localStorage has no entry', () => {
    const { result } = renderHook(() => useZenMode());
    expect(result.current.isZen).toBe(false);
  });

  it('reads true from localStorage when stored as "true"', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useZenMode());
    expect(result.current.isZen).toBe(true);
  });

  it('returns false when stored value is not "true"', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { result } = renderHook(() => useZenMode());
    expect(result.current.isZen).toBe(false);
  });

  it('falls back to false when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const { result } = renderHook(() => useZenMode());
    expect(result.current.isZen).toBe(false);
    vi.restoreAllMocks();
  });
});

// ── toggleZen ─────────────────────────────────────────────────────────────────
describe('useZenMode — toggleZen', () => {
  it('toggles from false to true', () => {
    const { result } = renderHook(() => useZenMode());
    act(() => result.current.toggleZen());
    expect(result.current.isZen).toBe(true);
  });

  it('toggles from true back to false', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useZenMode());
    act(() => result.current.toggleZen());
    expect(result.current.isZen).toBe(false);
  });

  it('persists the toggled value to localStorage', () => {
    const { result } = renderHook(() => useZenMode());
    act(() => result.current.toggleZen());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});

// ── exitZen ───────────────────────────────────────────────────────────────────
describe('useZenMode — exitZen', () => {
  it('sets isZen to false', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useZenMode());
    expect(result.current.isZen).toBe(true);
    act(() => result.current.exitZen());
    expect(result.current.isZen).toBe(false);
  });

  it('persists false to localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useZenMode());
    act(() => result.current.exitZen());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });
});

// ── Escape key listener ───────────────────────────────────────────────────────
describe('useZenMode — Escape key listener', () => {
  it('exits zen mode when Escape is pressed while isZen is true', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useZenMode());
    expect(result.current.isZen).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.isZen).toBe(false);
  });

  it('does not add keydown listener when isZen is false', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(() => useZenMode());
    expect(result.current.isZen).toBe(false);
    // The keydown handler should not have been registered since isZen starts false
    const keydownCalls = addSpy.mock.calls.filter(([event]) => event === 'keydown');
    expect(keydownCalls).toHaveLength(0);
    addSpy.mockRestore();
  });

  it('ignores non-Escape keys while in zen mode', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useZenMode());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(result.current.isZen).toBe(true);
  });
});
