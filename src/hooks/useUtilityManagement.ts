// Consolidated Utility & Helper Management Module (ETAPA 34)
// Consolidates: useDebounce, useInViewport, useMountedRef, usePrefetchOnHover, useUndoableAction
import { useEffect, useRef, useCallback, useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// DEBOUNCE HOOK
// ──────────────────────────────────────────────────────────────────────────

export function useDebounceManagement<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// ──────────────────────────────────────────────────────────────────────────
// IN-VIEWPORT INTERSECTION OBSERVER HOOK
// ──────────────────────────────────────────────────────────────────────────

interface UseInViewportOptions {
  threshold?: number | number[];
  rootMargin?: string;
  root?: Element | null;
}

export function useInViewportManagement(
  ref: React.RefObject<HTMLElement>,
  options: UseInViewportOptions = {}
): boolean {
  const [isInViewport, setIsInViewport] = useState(false);
  const { threshold = 0.1, rootMargin = '0px', root = null } = options;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry.isIntersecting);
      },
      { threshold, rootMargin, root }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [ref, threshold, rootMargin, root]);

  return isInViewport;
}

// ──────────────────────────────────────────────────────────────────────────
// MOUNTED REF HOOK
// ──────────────────────────────────────────────────────────────────────────

export function useMountedRefManagement(): React.MutableRefObject<boolean> {
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return mountedRef;
}

// ──────────────────────────────────────────────────────────────────────────
// PREFETCH ON HOVER HOOK
// ──────────────────────────────────────────────────────────────────────────

interface PrefetchOptions {
  onPrefetch?: (url: string) => Promise<void>;
}

export function usePrefetchOnHoverManagement(
  ref: React.RefObject<HTMLElement>,
  url: string,
  options: PrefetchOptions = {}
): void {
  const { onPrefetch } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseEnter = () => {
      if (onPrefetch) {
        onPrefetch(url);
      } else {
        // Default browser prefetch
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
      }
    };

    element.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [ref, url, onPrefetch]);
}

// ──────────────────────────────────────────────────────────────────────────
// UNDOABLE ACTION HOOK
// ──────────────────────────────────────────────────────────────────────────

interface UndoableAction<T> {
  redo(): void;
  undo(): void;
  canUndo: boolean;
  canRedo: boolean;
  history: T[];
  current: T;
}

export function useUndoableActionManagement<T>(initialValue: T): UndoableAction<T> {
  const [history, setHistory] = useState<T[]>([initialValue]);
  const [current, setCurrent] = useState<T>(initialValue);
  const [pointer, setPointer] = useState(0);

  const execute = useCallback(
    (value: T) => {
      const newHistory = history.slice(0, pointer + 1);
      newHistory.push(value);
      setHistory(newHistory);
      setPointer(newHistory.length - 1);
      setCurrent(value);
    },
    [history, pointer]
  );

  const undo = useCallback(() => {
    if (pointer > 0) {
      const newPointer = pointer - 1;
      setPointer(newPointer);
      setCurrent(history[newPointer]);
    }
  }, [pointer, history]);

  const redo = useCallback(() => {
    if (pointer < history.length - 1) {
      const newPointer = pointer + 1;
      setPointer(newPointer);
      setCurrent(history[newPointer]);
    }
  }, [pointer, history]);

  return {
    redo,
    undo,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
    history,
    current,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// DOCUMENT TITLE HOOK
// ──────────────────────────────────────────────────────────────────────────

export function useDocumentTitleManagement(title: string, suffix?: string): void {
  useEffect(() => {
    const fullTitle = suffix ? `${title} ${suffix}` : title;
    document.title = fullTitle;
  }, [title, suffix]);
}

// ──────────────────────────────────────────────────────────────────────────
// SAFE STORAGE HOOK (localStorage wrapper)
// ──────────────────────────────────────────────────────────────────────────

export function useSafeStorageManagement<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch {
        // Storage unavailable
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

export type { UseInViewportOptions, PrefetchOptions, UndoableAction };
