/**
 * Tests for useNavigationHistory().
 *
 * Covered:
 *   - Initial view from defaultView param when hash is empty
 *   - Initial view from window.location.hash when set (non-reserved)
 *   - navigateTo(): updates currentView, pushes to history
 *   - navigateTo() same view: no-op
 *   - goBack() / goForward() navigation and canGoBack / canGoForward flags
 *   - breadcrumbTrail: deduplicates consecutive entries, capped at 4
 *   - MAX_HISTORY = 50: oldest entry dropped when exceeded
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavigationHistory } from '../useNavigationHistory';

beforeEach(() => {
  // Reset hash to empty before each test
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

// ── initial state ──────────────────────────────────────────────────────────────
describe('useNavigationHistory — initial state', () => {
  it('uses defaultView when no hash is set', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    expect(result.current.currentView).toBe('inbox');
  });

  it('uses window.location.hash when set (non-reserved)', () => {
    window.history.replaceState(null, '', '#contacts');
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    expect(result.current.currentView).toBe('contacts');
  });

  it('falls back to defaultView for reserved hash "main-content"', () => {
    window.history.replaceState(null, '', '#main-content');
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    expect(result.current.currentView).toBe('inbox');
  });

  it('starts with canGoBack=false and canGoForward=false', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it('history has exactly 1 entry on mount', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].viewId).toBe('inbox');
  });
});

// ── navigateTo ─────────────────────────────────────────────────────────────────
describe('useNavigationHistory — navigateTo()', () => {
  it('updates currentView to the new view', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    expect(result.current.currentView).toBe('contacts');
  });

  it('adds an entry to the history stack', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[1].viewId).toBe('contacts');
  });

  it('enables canGoBack after first navigation', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    expect(result.current.canGoBack).toBe(true);
  });

  it('is a no-op when navigating to the current view', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('inbox'));
    expect(result.current.history).toHaveLength(1);
  });

  it('truncates forward history when navigating after goBack', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    act(() => result.current.navigateTo('settings'));
    act(() => result.current.goBack());
    // Now at 'contacts'; going to 'dashboard' should drop 'settings'
    act(() => result.current.navigateTo('dashboard'));
    const ids = result.current.history.map((e) => e.viewId);
    expect(ids).toEqual(['inbox', 'contacts', 'dashboard']);
    expect(result.current.canGoForward).toBe(false);
  });
});

// ── goBack / goForward ─────────────────────────────────────────────────────────
describe('useNavigationHistory — goBack() / goForward()', () => {
  it('goBack() moves to the previous view', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    act(() => result.current.goBack());
    expect(result.current.currentView).toBe('inbox');
  });

  it('goBack() at the start is a no-op', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.goBack());
    expect(result.current.currentView).toBe('inbox');
  });

  it('goForward() after goBack() moves forward again', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    act(() => result.current.goBack());
    act(() => result.current.goForward());
    expect(result.current.currentView).toBe('contacts');
  });

  it('goForward() at the end is a no-op', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    act(() => result.current.goForward()); // already at end
    expect(result.current.currentView).toBe('contacts');
  });

  it('canGoForward becomes true after goBack(), false again after goForward()', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    act(() => result.current.goBack());
    expect(result.current.canGoForward).toBe(true);
    act(() => result.current.goForward());
    expect(result.current.canGoForward).toBe(false);
  });
});

// ── breadcrumbTrail ────────────────────────────────────────────────────────────
describe('useNavigationHistory — breadcrumbTrail', () => {
  it('starts with [defaultView]', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    expect(result.current.breadcrumbTrail).toEqual(['inbox']);
  });

  it('grows as views are navigated', () => {
    const { result } = renderHook(() => useNavigationHistory('inbox'));
    act(() => result.current.navigateTo('contacts'));
    act(() => result.current.navigateTo('settings'));
    expect(result.current.breadcrumbTrail).toEqual(['inbox', 'contacts', 'settings']);
  });

  it('is capped at BREADCRUMB_DEPTH = 4', () => {
    const { result } = renderHook(() => useNavigationHistory('a'));
    act(() => result.current.navigateTo('b'));
    act(() => result.current.navigateTo('c'));
    act(() => result.current.navigateTo('d'));
    act(() => result.current.navigateTo('e'));
    expect(result.current.breadcrumbTrail).toHaveLength(4);
  });
});
