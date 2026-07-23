/**
 * Tests for useSidebarFavorites().
 *
 * The hook stores up to 6 favorites in localStorage under the key
 * 'sidebar-favorites'. All reads/writes happen through the real
 * localStorage API provided by happy-dom.
 *
 * Covered:
 *   - Default state: empty favorites, maxReached=false
 *   - Initialises from existing localStorage value on mount
 *   - toggleFavorite adds an item that is not yet present
 *   - toggleFavorite removes an item that is already present
 *   - isFavorite returns the correct boolean
 *   - maxReached becomes true once 6 items are stored
 *   - toggleFavorite is a no-op when MAX_FAVORITES is already reached and
 *     the item is not yet in the list (does not add a 7th)
 *   - Changes are persisted to localStorage after each toggle
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarFavorites } from '../useSidebarState';

const STORAGE_KEY = 'sidebar-favorites';

beforeEach(() => {
  localStorage.clear();
});

// ── default state ──────────────────────────────────────────────────────────────
describe('useSidebarFavorites — default state', () => {
  it('starts with an empty favorites list', () => {
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it('maxReached is false when favorites is empty', () => {
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.maxReached).toBe(false);
  });

  it('initialises from existing localStorage data', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['inbox', 'contacts']));
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.favorites).toEqual(['inbox', 'contacts']);
  });

  it('falls back to empty array for invalid JSON in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.favorites).toEqual([]);
  });
});

// ── toggleFavorite ─────────────────────────────────────────────────────────────
describe('useSidebarFavorites — toggleFavorite', () => {
  it('adds an id that is not yet in the list', () => {
    const { result } = renderHook(() => useSidebarFavorites());
    act(() => { result.current.toggleFavorite('inbox'); });
    expect(result.current.favorites).toContain('inbox');
  });

  it('removes an id that is already in the list', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['inbox', 'contacts']));
    const { result } = renderHook(() => useSidebarFavorites());
    act(() => { result.current.toggleFavorite('inbox'); });
    expect(result.current.favorites).not.toContain('inbox');
    expect(result.current.favorites).toContain('contacts');
  });

  it('does NOT add a 7th item when maxReached', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(six));
    const { result } = renderHook(() => useSidebarFavorites());
    act(() => { result.current.toggleFavorite('g'); });
    expect(result.current.favorites).toHaveLength(6);
    expect(result.current.favorites).not.toContain('g');
  });

  it('persists the new list to localStorage after toggle-add', () => {
    const { result } = renderHook(() => useSidebarFavorites());
    act(() => { result.current.toggleFavorite('dashboard'); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toContain('dashboard');
  });

  it('persists the pruned list to localStorage after toggle-remove', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['dashboard']));
    const { result } = renderHook(() => useSidebarFavorites());
    act(() => { result.current.toggleFavorite('dashboard'); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '["x"]');
    expect(stored).not.toContain('dashboard');
  });
});

// ── isFavorite ─────────────────────────────────────────────────────────────────
describe('useSidebarFavorites — isFavorite', () => {
  it('returns true for an id that is in favorites', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['inbox']));
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.isFavorite('inbox')).toBe(true);
  });

  it('returns false for an id that is not in favorites', () => {
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.isFavorite('inbox')).toBe(false);
  });
});

// ── maxReached ─────────────────────────────────────────────────────────────────
describe('useSidebarFavorites — maxReached', () => {
  it('is false when fewer than 6 favorites', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 'b', 'c']));
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.maxReached).toBe(false);
  });

  it('is true when exactly 6 favorites are present', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f']));
    const { result } = renderHook(() => useSidebarFavorites());
    expect(result.current.maxReached).toBe(true);
  });

  it('becomes true after the 6th toggleFavorite', () => {
    const { result } = renderHook(() => useSidebarFavorites());
    act(() => {
      ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id) => result.current.toggleFavorite(id));
    });
    expect(result.current.maxReached).toBe(true);
  });
});