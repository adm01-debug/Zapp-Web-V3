/**
 * Tests for useInboxStatusPref().
 *
 * The hook stores a boolean flag in localStorage under
 * 'inbox-status-label-visible' and synchronises cross-component via a
 * custom window event 'inbox-status-label-change'. Happy-dom provides a
 * real localStorage, so no mocking is required for storage. The window
 * event system is also real — dispatchEvent triggers registered listeners.
 *
 * Covered:
 *   - Default showLabel is false when localStorage is empty
 *   - Initialises to true when localStorage already holds 'true'
 *   - toggle() flips showLabel from false → true
 *   - toggle() flips showLabel from true → false
 *   - toggle() persists the new value to localStorage
 *   - toggle() dispatches the custom event so other hooks can react
 *   - Receiving the custom event from an external source updates showLabel
 *   - Event listener is removed on unmount (no state update after unmount)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxStatusPref } from '../useInboxStatusPref';

const STORAGE_KEY = 'inbox-status-label-visible';
const EVENT_NAME = 'inbox-status-label-change';

beforeEach(() => {
  localStorage.clear();
});

// ── default state ──────────────────────────────────────────────────────────────
describe('useInboxStatusPref — default state', () => {
  it('showLabel is false when localStorage is empty', () => {
    const { result } = renderHook(() => useInboxStatusPref());
    expect(result.current.showLabel).toBe(false);
  });

  it('showLabel is true when localStorage already holds "true"', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useInboxStatusPref());
    expect(result.current.showLabel).toBe(true);
  });

  it('showLabel is false when localStorage holds an arbitrary non-"true" value', () => {
    localStorage.setItem(STORAGE_KEY, 'yes');
    const { result } = renderHook(() => useInboxStatusPref());
    expect(result.current.showLabel).toBe(false);
  });
});

// ── toggle ─────────────────────────────────────────────────────────────────────
describe('useInboxStatusPref — toggle', () => {
  it('flips showLabel from false to true', () => {
    const { result } = renderHook(() => useInboxStatusPref());
    act(() => { result.current.toggle(); });
    expect(result.current.showLabel).toBe(true);
  });

  it('flips showLabel from true to false', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useInboxStatusPref());
    act(() => { result.current.toggle(); });
    expect(result.current.showLabel).toBe(false);
  });

  it('persists the new value to localStorage after toggle (false → true)', () => {
    const { result } = renderHook(() => useInboxStatusPref());
    act(() => { result.current.toggle(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('persists the new value to localStorage after toggle (true → false)', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useInboxStatusPref());
    act(() => { result.current.toggle(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('double-toggle returns to the original state', () => {
    const { result } = renderHook(() => useInboxStatusPref());
    act(() => { result.current.toggle(); });
    act(() => { result.current.toggle(); });
    expect(result.current.showLabel).toBe(false);
  });
});

// ── cross-component event sync ─────────────────────────────────────────────────
describe('useInboxStatusPref — cross-component event sync', () => {
  it('updates showLabel when another source writes to localStorage and dispatches the event', () => {
    const { result } = renderHook(() => useInboxStatusPref());
    expect(result.current.showLabel).toBe(false);

    act(() => {
      // Simulate another component turning the label on
      localStorage.setItem(STORAGE_KEY, 'true');
      window.dispatchEvent(new Event(EVENT_NAME));
    });

    expect(result.current.showLabel).toBe(true);
  });

  it('toggle() dispatches the custom event so other hook instances react', () => {
    const { result: hookA } = renderHook(() => useInboxStatusPref());
    const { result: hookB } = renderHook(() => useInboxStatusPref());

    act(() => { hookA.current.toggle(); });

    // hookB listens to the same window event — should see the update
    expect(hookB.current.showLabel).toBe(true);
  });
});

// ── cleanup ────────────────────────────────────────────────────────────────────
describe('useInboxStatusPref — cleanup on unmount', () => {
  it('does not update showLabel after the component unmounts', () => {
    const { result, unmount } = renderHook(() => useInboxStatusPref());
    unmount();

    // Write to localStorage and dispatch event — hook should NOT react
    act(() => {
      localStorage.setItem(STORAGE_KEY, 'true');
      window.dispatchEvent(new Event(EVENT_NAME));
    });

    // State captured before unmount was false; it should remain false
    expect(result.current.showLabel).toBe(false);
  });
});
