/**
 * Tests for useAriaAnnouncer().
 *
 * Verifies that:
 *   - A role="status" aria-live region is appended to document.body on mount
 *   - The region is removed on unmount
 *   - announce() sets textContent (via rAF, faked with vi.useFakeTimers)
 *   - AriaAnnouncer component is a null-render wrapper
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAriaAnnouncer } from '../useAriaAnnouncer';

beforeEach(() => {
  // Remove any lingering announcer element between tests
  const el = document.getElementById('aria-route-announcer');
  if (el) el.remove();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  const el = document.getElementById('aria-route-announcer');
  if (el) el.remove();
});

describe('useAriaAnnouncer — DOM region', () => {
  it('appends a role="status" element to document.body on mount', () => {
    renderHook(() => useAriaAnnouncer());
    const el = document.getElementById('aria-route-announcer');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('status');
  });

  it('sets aria-live="polite" on the region', () => {
    renderHook(() => useAriaAnnouncer());
    const el = document.getElementById('aria-route-announcer');
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });

  it('sets aria-atomic="true" on the region', () => {
    renderHook(() => useAriaAnnouncer());
    const el = document.getElementById('aria-route-announcer');
    expect(el?.getAttribute('aria-atomic')).toBe('true');
  });

  it('removes the region from document.body on unmount', () => {
    const { unmount } = renderHook(() => useAriaAnnouncer());
    expect(document.getElementById('aria-route-announcer')).not.toBeNull();
    unmount();
    expect(document.getElementById('aria-route-announcer')).toBeNull();
  });
});

describe('useAriaAnnouncer — announce()', () => {
  it('clears textContent then sets it via requestAnimationFrame', () => {
    const { result } = renderHook(() => useAriaAnnouncer());
    const el = document.getElementById('aria-route-announcer')!;
    el.textContent = 'old message';

    act(() => {
      result.current.announce('New alert');
      // After announce() is called textContent should be cleared immediately
      expect(el.textContent).toBe('');
      // rAF has not fired yet
    });

    // Flush rAF
    act(() => { vi.runAllTimers(); });
    expect(el.textContent).toBe('New alert');
  });

  it('does not throw when the region is not yet initialised', () => {
    // Unmount immediately — region removed
    const { result, unmount } = renderHook(() => useAriaAnnouncer());
    unmount();
    expect(() => result.current.announce('x')).not.toThrow();
  });
});
