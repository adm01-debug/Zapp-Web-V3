/**
 * Tests for useTheme().
 *
 * The hook manages theme state via a module-level singleton (listeners + themeState)
 * backed by localStorage and resolved against window.matchMedia for 'system' mode.
 * happy-dom provides real localStorage; window.matchMedia is stubbed per-test.
 *
 * initializeTheme() is called on every hook mount and re-reads localStorage, which
 * resets the module-level themeState — this guarantees test isolation as long as
 * localStorage is cleared in beforeEach.
 *
 * Covered:
 *   - Initial theme is 'system' when localStorage is empty
 *   - Initial resolvedTheme is 'light' when prefers-color-scheme is light
 *   - Initial resolvedTheme is 'dark' when prefers-color-scheme is dark
 *   - localStorage value 'dark' initialises theme='dark', resolvedTheme='dark'
 *   - localStorage value 'light' initialises theme='light', resolvedTheme='light'
 *   - Invalid localStorage value falls back to 'system'
 *   - isDark / isLight / isSystem derived booleans are correct
 *   - setTheme('dark') updates theme, resolvedTheme, and localStorage
 *   - setTheme('light') updates theme, resolvedTheme, and localStorage
 *   - setTheme('system') resolves via matchMedia
 *   - toggleTheme() flips resolvedTheme from light to dark
 *   - toggleTheme() flips resolvedTheme from dark to light
 *   - cycleTheme() cycles light → dark → system → light
 *   - Cross-instance sync: setTheme in one hook updates another
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';

const STORAGE_KEY = 'theme';

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: prefersDark,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  mockMatchMedia(false); // default: light system preference
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── initial state ──────────────────────────────────────────────────────────────
describe('useTheme — initial state', () => {
  it('theme is "system" when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('resolvedTheme is "light" when system preference is light', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('resolvedTheme is "dark" when system preference is dark', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('theme is "dark" when localStorage holds "dark"', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('theme is "light" when localStorage holds "light"', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('theme falls back to "system" for an invalid localStorage value', () => {
    localStorage.setItem(STORAGE_KEY, 'ocean-blue');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });
});

// ── derived booleans ───────────────────────────────────────────────────────────
describe('useTheme — derived booleans', () => {
  it('isSystem is true when theme="system"', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.isSystem).toBe(true);
  });

  it('isDark is true when resolvedTheme is dark', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
    expect(result.current.isLight).toBe(false);
  });

  it('isLight is true when resolvedTheme is light', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.isLight).toBe(true);
    expect(result.current.isDark).toBe(false);
  });

  it('isSystem is false when theme is explicitly "dark"', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.isSystem).toBe(false);
  });
});

// ── setTheme ───────────────────────────────────────────────────────────────────
describe('useTheme — setTheme', () => {
  it('setTheme("dark") updates theme and resolvedTheme', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme('dark'); });
    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('setTheme("light") updates theme and resolvedTheme', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme('light'); });
    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('setTheme persists the value to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme('dark'); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('setTheme("system") resolves via matchMedia (dark preference)', () => {
    mockMatchMedia(true); // system = dark
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme('system'); });
    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('setTheme("system") resolves via matchMedia (light preference)', () => {
    mockMatchMedia(false); // system = light
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme('system'); });
    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
  });
});

// ── toggleTheme ────────────────────────────────────────────────────────────────
describe('useTheme — toggleTheme', () => {
  it('toggleTheme() switches from light to dark', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.toggleTheme(); });
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.theme).toBe('dark');
  });

  it('toggleTheme() switches from dark to light', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.toggleTheme(); });
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.theme).toBe('light');
  });

  it('double-toggle returns to the original theme', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.toggleTheme(); });
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe('dark');
  });
});

// ── cycleTheme ─────────────────────────────────────────────────────────────────
describe('useTheme — cycleTheme', () => {
  it('cycles light → dark', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.cycleTheme(); });
    expect(result.current.theme).toBe('dark');
  });

  it('cycles dark → system', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.cycleTheme(); });
    expect(result.current.theme).toBe('system');
  });

  it('cycles system → light', () => {
    // system is default (localStorage empty)
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.cycleTheme(); });
    expect(result.current.theme).toBe('light');
  });

  it('completes a full light → dark → system → light cycle', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.cycleTheme(); });
    expect(result.current.theme).toBe('dark');
    act(() => { result.current.cycleTheme(); });
    expect(result.current.theme).toBe('system');
    act(() => { result.current.cycleTheme(); });
    expect(result.current.theme).toBe('light');
  });
});

// ── cross-instance sync ────────────────────────────────────────────────────────
describe('useTheme — cross-instance sync', () => {
  it('setTheme in one hook updates another rendered hook instance', () => {
    const { result: hookA } = renderHook(() => useTheme());
    const { result: hookB } = renderHook(() => useTheme());

    act(() => { hookA.current.setTheme('dark'); });

    expect(hookB.current.theme).toBe('dark');
    expect(hookB.current.resolvedTheme).toBe('dark');
  });

  it('toggleTheme in one hook is reflected in another', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const { result: hookA } = renderHook(() => useTheme());
    const { result: hookB } = renderHook(() => useTheme());

    act(() => { hookA.current.toggleTheme(); });

    expect(hookB.current.theme).toBe('dark');
  });
});
