import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

/** Navigation Entry interface definition. */
export interface NavigationEntry {
  viewId: string;
  timestamp: number;
}

interface NavigationState {
  entries: NavigationEntry[];
  index: number;
}

interface NavigationHistoryReturn {
  currentView: string;
  navigateTo: (viewId: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Breadcrumb trail (last N entries, deduplicated consecutive) */
  breadcrumbTrail: string[];
  /** Previous view id (for transition direction) */
  previousView: string | null;
  /** Full history stack */
  history: NavigationEntry[];
}

const MAX_HISTORY = 50;
const BREADCRUMB_DEPTH = 4;

// Hashes that are NOT view IDs (e.g. skip-to-content anchors)
const RESERVED_HASHES = new Set(['main-content', 'main-navigation', 'inbox-section', 'search-input']);

/** Manages navigation history with back/forward stacks, breadcrumbs, and URL hash synchronization. */
export function useNavigationHistory(defaultView = 'inbox'): NavigationHistoryReturn {
  const getInitialView = () => {
    const hash = window.location.hash.replace('#', '');
    return (hash && !RESERVED_HASHES.has(hash)) ? hash : defaultView;
  };

  const [state, setState] = useState<NavigationState>(() => ({
    entries: [{ viewId: getInitialView(), timestamp: Date.now() }],
    index: 0,
  }));

  const previousViewRef = useRef<string | null>(null);
  const isInternalNav = useRef(false);

  const currentView = state.entries[state.index]?.viewId ?? defaultView;

  const syncHash = useCallback((viewId: string) => {
    isInternalNav.current = true;
    window.history.pushState(null, '', `#${viewId}`);
  }, []);

  const navigateTo = useCallback((viewId: string) => {
    setState(prev => {
      const currentViewId = prev.entries[prev.index]?.viewId;
      if (viewId === currentViewId) return prev;

      previousViewRef.current = currentViewId ?? null;

      // Truncate forward history
      const truncated = prev.entries.slice(0, prev.index + 1);
      const newEntry: NavigationEntry = { viewId, timestamp: Date.now() };
      const newEntries = [...truncated, newEntry].slice(-MAX_HISTORY);
      const newIndex = newEntries.length - 1;

      syncHash(viewId);

      return { entries: newEntries, index: newIndex };
    });
  }, [syncHash]);

  // Sync hash → state on browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      if (isInternalNav.current) {
        isInternalNav.current = false;
        return;
      }
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== currentView && !RESERVED_HASHES.has(hash)) {
        navigateTo(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentView, navigateTo]);

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.index <= 0) return prev;
      previousViewRef.current = prev.entries[prev.index]?.viewId ?? null;
      const newIndex = prev.index - 1;
      const targetView = prev.entries[newIndex]?.viewId;
      if (targetView) syncHash(targetView);
      return { ...prev, index: newIndex };
    });
  }, [syncHash]);

  const goForward = useCallback(() => {
    setState(prev => {
      if (prev.index >= prev.entries.length - 1) return prev;
      previousViewRef.current = prev.entries[prev.index]?.viewId ?? null;
      const newIndex = prev.index + 1;
      const targetView = prev.entries[newIndex]?.viewId;
      if (targetView) syncHash(targetView);
      return { ...prev, index: newIndex };
    });
  }, [syncHash]);

  const canGoBack = state.index > 0;
  const canGoForward = state.index < state.entries.length - 1;

  const breadcrumbTrail = useMemo(() => {
    const trail: string[] = [];
    for (let i = state.index; i >= 0 && trail.length < BREADCRUMB_DEPTH; i--) {
      const entry = state.entries[i];
      if (!entry) break;
      const viewId = entry.viewId;
      if (trail.length === 0 || trail[trail.length - 1] !== viewId) {
        trail.push(viewId);
      }
    }
    return trail.reverse();
  }, [state.entries, state.index]);

  return {
    currentView,
    navigateTo,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    breadcrumbTrail,
    previousView: previousViewRef.current,
    history: state.entries,
  };
}
