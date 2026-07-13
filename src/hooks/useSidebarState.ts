/**
 * useSidebarState.ts (v1.0)
 * Unified sidebar state management consolidating:
 * - useSidebarCollapse: collapse/expand state with event listener
 * - useSidebarFavorites: favorites list management with max limit
 *
 * Backward compatibility maintained through re-exports of legacy hook names.
 */
import { useState, useEffect, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

// ──────────────────────────────────────────────────────────────────────────
// COLLAPSE STATE
// ──────────────────────────────────────────────────────────────────────────

const COLLAPSE_STORAGE_KEY = 'zapp-sidebar-collapsed';

/**
 * Hook for managing sidebar collapse/expand state.
 * Persists to localStorage and listens to toggle-sidebar custom event (keyboard shortcuts).
 */
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = safeGetItem(COLLAPSE_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      safeSetItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = () => toggle();
    document.addEventListener('toggle-sidebar', handler);
    return () => document.removeEventListener('toggle-sidebar', handler);
  }, [toggle]);

  return { collapsed, toggle };
}

// ──────────────────────────────────────────────────────────────────────────
// FAVORITES STATE
// ──────────────────────────────────────────────────────────────────────────

const FAVORITES_STORAGE_KEY = 'sidebar-favorites';
const MAX_FAVORITES = 6;

/**
 * Hook for managing sidebar favorites list.
 * Persists to localStorage with max 6 favorites.
 */
export function useSidebarFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch { /* storage unavailable */ }
  }, [favorites]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      if (prev.includes(id)) {
        return prev.filter((f) => f !== id);
      }
      if (prev.length >= MAX_FAVORITES) return prev;
      return [...prev, id];
    });
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite, maxReached: favorites.length >= MAX_FAVORITES };
}

// ──────────────────────────────────────────────────────────────────────────
// UNIFIED SIDEBAR STATE
// ──────────────────────────────────────────────────────────────────────────

export interface SidebarState {
  collapsed: boolean;
  toggleCollapsed: () => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  maxReached: boolean;
}

/**
 * Unified hook for complete sidebar state management.
 * Combines collapse and favorites in one call.
 */
export function useSidebarState(): SidebarState {
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapse();
  const { favorites, toggleFavorite, isFavorite, maxReached } = useSidebarFavorites();

  return {
    collapsed,
    toggleCollapsed,
    favorites,
    toggleFavorite,
    isFavorite,
    maxReached,
  };
}

export default {
  useSidebarCollapse,
  useSidebarFavorites,
  useSidebarState,
};
