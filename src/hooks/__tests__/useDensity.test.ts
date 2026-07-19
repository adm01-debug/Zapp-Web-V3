/**
 * Tests for useDensity().
 *
 * localStorage is accessed by the hook internals — we spy on it.
 * document.documentElement.setAttribute is verified via actual DOM.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDensity } from '../useDensity';

const STORAGE_KEY = 'ui-density';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-density');
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-density');
});

describe('useDensity — initial state', () => {
  it('defaults to "comfortable" when localStorage has no stored value', () => {
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe('comfortable');
  });

  it('reads initial density from localStorage if available', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe('compact');
  });

  it('sets data-density attribute on <html> on mount', () => {
    renderHook(() => useDensity());
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
  });
});

describe('useDensity — setDensity', () => {
  it('updates density state', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity('dense'));
    expect(result.current.density).toBe('dense');
  });

  it('persists the new density to localStorage', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity('compact'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('compact');
  });

  it('updates the data-density attribute on <html>', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity('dense'));
    expect(document.documentElement.getAttribute('data-density')).toBe('dense');
  });
});

describe('useDensity — cycleDensity', () => {
  it('cycles comfortable → compact → dense → comfortable', () => {
    const { result } = renderHook(() => useDensity());

    act(() => result.current.cycleDensity());
    expect(result.current.density).toBe('compact');

    act(() => result.current.cycleDensity());
    expect(result.current.density).toBe('dense');

    act(() => result.current.cycleDensity());
    expect(result.current.density).toBe('comfortable');
  });

  it('persists cycled value to localStorage', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.cycleDensity());
    expect(localStorage.getItem(STORAGE_KEY)).toBe('compact');
  });
});

describe('useDensity — localStorage failure', () => {
  it('falls back to "comfortable" when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe('comfortable');
    vi.restoreAllMocks();
  });
});
