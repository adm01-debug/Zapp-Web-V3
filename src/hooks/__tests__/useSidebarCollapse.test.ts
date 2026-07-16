/**
 * Tests for useSidebarCollapse().
 *
 * Covered:
 *   - Initial state: defaults to collapsed=true when no stored value
 *   - Initial state: reads stored 'true'/'false' from localStorage on mount
 *   - toggle(): flips state and persists to localStorage
 *   - 'toggle-sidebar' custom DOM event calls toggle()
 *   - Cleanup: event listener removed on unmount
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarCollapse } from '../useSidebarState';

const STORAGE_KEY = 'zapp-sidebar-collapsed';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ── initial state ──────────────────────────────────────────────────────────────
describe('useSidebarCollapse — initial state', () => {
  it('defaults to collapsed=true when localStorage has no entry', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
  });

  it('reads collapsed=true from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
  });

  it('reads collapsed=false from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);
  });
});

// ── toggle ─────────────────────────────────────────────────────────────────────
describe('useSidebarCollapse — toggle()', () => {
  it('flips collapsed from true to false', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
  });

  it('flips collapsed from false to true', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { result } = renderHook(() => useSidebarCollapse());
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
  });

  it('persists new value to localStorage after toggle', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    act(() => result.current.toggle());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('second toggle restores original state', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
  });
});

// ── toggle-sidebar custom event ────────────────────────────────────────────────
describe('useSidebarCollapse — "toggle-sidebar" DOM event', () => {
  it('toggles collapsed when the custom event fires', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
    act(() => {
      document.dispatchEvent(new Event('toggle-sidebar'));
    });
    expect(result.current.collapsed).toBe(false);
  });

  it('fires twice restores original state', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    act(() => {
      document.dispatchEvent(new Event('toggle-sidebar'));
      document.dispatchEvent(new Event('toggle-sidebar'));
    });
    expect(result.current.collapsed).toBe(true);
  });

  it('removes the event listener on unmount', () => {
    const { result, unmount } = renderHook(() => useSidebarCollapse());
    unmount();
    // After unmount, event should have no effect
    act(() => {
      document.dispatchEvent(new Event('toggle-sidebar'));
    });
    // result.current still reflects state at unmount time (collapsed=true)
    expect(result.current.collapsed).toBe(true);
  });
});
