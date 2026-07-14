// Consolidated Utility & Helper Hooks Management Module (ETAPA 49 consolidation)
import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ===== Debounce Management =====
interface UseDebounceOptions {
  delay?: number;
  leading?: boolean;
}

/** Debounces a callback function with optional leading and trailing calls. */
export function useDebounceManagement<T extends (...args: any[]) => any>(
  callback: T,
  optionsOrDelay: UseDebounceOptions | number = {},
): T {
  const options: UseDebounceOptions = typeof optionsOrDelay === 'number' ? { delay: optionsOrDelay } : optionsOrDelay;
  const { delay = 300, leading = false } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const leadingCalledRef = useRef(false);
  const hasTrailingRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (leading && !leadingCalledRef.current) {
        leadingCalledRef.current = true;
        callbackRef.current(...args);
      } else {
        hasTrailingRef.current = true;
      }

      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        if (!leading || hasTrailingRef.current) {
          callbackRef.current(...args);
        }
        leadingCalledRef.current = false;
        hasTrailingRef.current = false;
      }, delay);
    },
    [delay, leading],
  ) as T;

  return debouncedFn;
}

/** Returns a debounced version of a value with specified delay. */
export function useDebouncedValueManagement<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ===== Document Title Management =====
const BASE_TITLE = 'WhatsApp Omnichannel';

/** Updates the document title and restores the previous title on unmount. */
export function useDocumentTitleManagement(title?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

// ===== In-Viewport Management =====
export interface UseInViewportOptions {
  rootMargin?: string;
  threshold?: number | number[];
  keepVisibleMs?: number;
  disabled?: boolean;
}

/** Detects when an element enters the viewport using Intersection Observer API. */
export function useInViewportManagement(
  ref: RefObject<Element | null>,
  options: UseInViewportOptions = {},
): boolean {
  const { rootMargin = '200px', threshold = 0, keepVisibleMs = 1500, disabled = false } = options;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (disabled) {
      setVisible(false);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let stickyTimeout: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (stickyTimeout) {
              clearTimeout(stickyTimeout);
              stickyTimeout = null;
            }
            setVisible(true);
          } else if (keepVisibleMs > 0) {
            if (stickyTimeout) clearTimeout(stickyTimeout);
            stickyTimeout = setTimeout(() => {
              setVisible(false);
              stickyTimeout = null;
            }, keepVisibleMs);
          } else {
            setVisible(false);
          }
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(el);
    return () => {
      if (stickyTimeout) clearTimeout(stickyTimeout);
      observer.disconnect();
    };
  }, [ref, rootMargin, threshold, keepVisibleMs, disabled]);

  return visible;
}

// ===== Prefetch On Hover Management =====
const VIEW_QUERY_KEYS: Record<string, string[][]> = {
  inbox: [['contacts'], ['messages']],
  contacts: [['contacts']],
  dashboard: [['dashboard-stats'], ['contacts']],
  campaigns: [['campaigns']],
  'knowledge-base': [['knowledge-base-articles']],
  automations: [['automations']],
  agents: [['team-members']],
  queues: [['queues']],
  tags: [['tags']],
};

/** Provides prefetching of query data when hovering over view navigation elements. */
export function usePrefetchOnHoverManagement() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(
    (viewId: string) => {
      const keys = VIEW_QUERY_KEYS[viewId];
      if (!keys) return;

      keys.forEach((key) => {
        queryClient.prefetchQuery({
          queryKey: key,
          staleTime: 1000 * 60 * 5,
        });
      });
    },
    [queryClient],
  );

  return { prefetch };
}

// ===== Mounted Ref Management =====
/** Returns a ref that tracks whether the component is currently mounted. */
export function useMountedRefManagement() {
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  return mountedRef;
}

// ===== Undoable Action Management =====
interface UndoableActionOptions<T> {
  undoDuration?: number;
  successMessage: string;
  undoMessage?: string;
  action: () => Promise<T>;
  undoAction: () => Promise<void>;
  onCommit?: () => void;
}

interface UndoableActionState {
  isPending: boolean;
  canUndo: boolean;
  timeRemaining: number;
}

/** Manages actions with undo capability and time-limited reversal window. */
export function useUndoableActionManagement() {
  const [state, setState] = useState<UndoableActionState>({
    isPending: false,
    canUndo: false,
    timeRemaining: 0,
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingActionRef = useRef<{
    undoAction: () => Promise<void>;
    onCommit?: () => void;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const execute = useCallback(async <T,>(options: UndoableActionOptions<T>) => {
    const { undoDuration = 5000, successMessage, undoMessage = 'Ação desfeita', action, undoAction, onCommit } =
      options;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    setState({
      isPending: true,
      canUndo: true,
      timeRemaining: undoDuration / 1000,
    });

    try {
      const result = await action();

      pendingActionRef.current = { undoAction, onCommit };

      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, Math.ceil((undoDuration - elapsed) / 1000));
        setState((prev) => ({ ...prev, timeRemaining: remaining }));
      }, 100);

      toast.success(successMessage, {
        duration: undoDuration,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);

            try {
              await pendingActionRef.current?.undoAction();
              toast.success(undoMessage);
            } catch {
              toast.error('Erro ao desfazer ação');
            } finally {
              pendingActionRef.current = null;
              setState({
                isPending: false,
                canUndo: false,
                timeRemaining: 0,
              });
            }
          },
        },
      });

      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        pendingActionRef.current?.onCommit?.();
        pendingActionRef.current = null;

        setState({
          isPending: false,
          canUndo: false,
          timeRemaining: 0,
        });
      }, undoDuration);

      return result;
    } catch (error) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setState({
        isPending: false,
        canUndo: false,
        timeRemaining: 0,
      });
      throw error;
    }
  }, []);

  const cancelPendingAction = useCallback(async () => {
    if (!pendingActionRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    try {
      await pendingActionRef.current.undoAction();
      toast.success('Ação desfeita');
    } catch {
      toast.error('Erro ao desfazer ação');
    } finally {
      pendingActionRef.current = null;
      setState({
        isPending: false,
        canUndo: false,
        timeRemaining: 0,
      });
    }
  }, []);

  return {
    execute,
    cancelPendingAction,
    ...state,
  };
}

// ===== Pull To Refresh Management =====
interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

/** Implements pull-to-refresh gesture handling with customizable threshold. */
export function usePullToRefreshManagement({ onRefresh, threshold = 80, disabled = false }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return;
      const container = containerRef.current;
      if (container && container.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    },
    [disabled, isRefreshing],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || disabled || isRefreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        setPullDistance(Math.min(delta * 0.5, threshold * 1.5));
      }
    },
    [disabled, isRefreshing, threshold],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current || disabled) return;
    pulling.current = false;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold * 0.5);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh, disabled]);

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
