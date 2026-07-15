/**
 * useRetryAndErrorPrevention.ts (v1.0)
 * Unified retry and error prevention hooks consolidating:
 * - useRetryOperation: Simple exponential backoff for operations
 * - useSilentErrorPrevention suite: Comprehensive error prevention wrappers
 * - useRetryStrategy suite: Advanced retry with metrics tracking
 *
 * Backward compatibility maintained through re-exports of all legacy hook names.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
import {
  safeCallback,
  safeEventListener,
  handlePromiseRejection,
  fireAndForget,
  retryWithBackoff,
  withErrorRecovery,
  type ErrorSuppression,
  suppressError,
} from '@/lib/silentErrorPrevention';
import {
  RetryConfig,
  RetryExecutor,
  RETRY_CONFIG_TRANSIENT,
  RETRY_CONFIG_API,
  RETRY_CONFIG_DATABASE,
  RETRY_CONFIG_ASYNC,
  retryMetricsTracker,
  type RetryMetrics,
  type RetryPolicy,
} from '@/lib/retryStrategyAudit';

const log = getLogger('useRetryAndErrorPrevention');

// ──────────────────────────────────────────────────────────────────────────
// SECTION 1: Simple Operation Retry (useRetryOperation consolidation)
// ──────────────────────────────────────────────────────────────────────────

const FATAL_CODES = [
  'PGRST116',     // not found
  '23505',        // unique violation
  '23514',        // check constraint
  'CONTACT_NOT_FOUND',
  'CONFLICT',
  '401', '403',
];

interface RetryState { loading: boolean; attempt: number; lastError: string | null; }

/**
 * Simple retry hook for operations with exponential backoff (multiplier 3)
 * and state management. Used for contact save/update operations.
 */
/** Retries async operations with exponential backoff, state tracking, and automatic fatal error detection. */
export function useRetryOperation(maxAttempts = 3, baseDelayMs = 500) {
  const { toast } = useToast();
  const [state, setState] = useState<RetryState>({ loading: false, attempt: 0, lastError: null });

  const withRetry = useCallback(async <T>(fn: () => Promise<T>, label = 'Salvar'): Promise<T> => {
    let lastErr: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      setState({ loading: true, attempt, lastError: null });
      try {
        const result = await fn();
        setState({ loading: false, attempt: 0, lastError: null });
        return result;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastErr = error;
        if (FATAL_CODES.some((c) => error.message.includes(c))) {
          setState({ loading: false, attempt: 0, lastError: error.message });
          throw error;
        }
        if (attempt === maxAttempts) break;
        const delay = Math.min(baseDelayMs * Math.pow(3, attempt - 1) * (1 + Math.random() * 0.2), 30000);
        setState({ loading: true, attempt, lastError: `Tentando novamente (${attempt}/${maxAttempts})...` });
        if (attempt > 1) toast({ title: `⏳ ${label}`, description: `Tentativa ${attempt + 1}/${maxAttempts}...`, duration: delay });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    setState({ loading: false, attempt: 0, lastError: lastErr?.message ?? 'Erro' });
    throw lastErr;
  }, [maxAttempts, baseDelayMs, toast]);

  const reset = useCallback(() => setState({ loading: false, attempt: 0, lastError: null }), []);

  return { ...state, withRetry, reset };
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION 2: Silent Error Prevention Wrappers (useSilentErrorPrevention consolidation)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hook for wrapping event handlers with automatic error logging.
 */
/** Wraps event handlers with automatic error logging and exception handling. */
export function useSafeEventHandler<K extends keyof HTMLElementEventMap>(
  handler: (ev: HTMLElementEventMap[K]) => void,
  eventName: K
) {
  return useCallback(
    (event: HTMLElementEventMap[K]) => {
      try {
        handler(event);
      } catch (error) {
        log.error(`Event handler error (${String(eventName)}):`, error);
      }
    },
    [handler, eventName]
  );
}

/**
 * Hook for safely handling async operations with error recovery.
 */
/** Safely executes async operations with error recovery, fallback values, and optional throwing. */
export function useSafeAsync<T>(
  fn: () => Promise<T>,
  options?: {
    operation?: string;
    fallback?: T;
    shouldThrow?: boolean;
    dependencies?: any[];
  }
) {
  const { operation = 'Unknown', fallback, shouldThrow = false, dependencies = [] } = options || {};

  const executeAsync = useCallback(
    async () =>
      safeCallback(() => withErrorRecovery(fn, { operation, fallback, shouldThrow }), {
        name: operation,
      })(),
    [operation, fallback, shouldThrow, ...dependencies]
  );

  return executeAsync;
}

/**
 * Hook for automatically retrying failed operations with exponential backoff (multiplier 2).
 */
/** Retries async operations with configurable exponential backoff strategy. */
export function useSafeRetry<T>(
  fn: () => Promise<T>,
  options?: {
    operation?: string;
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    dependencies?: any[];
  }
) {
  const {
    operation = 'Unknown',
    maxAttempts = 3,
    delayMs = 100,
    backoffMultiplier = 2,
    dependencies = [],
  } = options || {};

  const executeRetry = useCallback(
    async () =>
      retryWithBackoff(fn, {
        operation,
        maxAttempts,
        delayMs,
        backoffMultiplier,
      }),
    [operation, maxAttempts, delayMs, backoffMultiplier, ...dependencies]
  );

  return executeRetry;
}

/**
 * Hook for managing fire-and-forget promises (e.g., analytics tracking).
 */
/** Executes promises without waiting for resolution, ideal for analytics and tracking. */
export function useFireAndForget() {
  return useCallback((promise: Promise<any>, operation: string = 'Unknown operation') => {
    fireAndForget(promise, { operation });
  }, []);
}

/**
 * Hook for wrapping callbacks with automatic error logging.
 */
/** Wraps callbacks with automatic error logging, fallback returns, and optional throwing. */
export function useSafeCallback<T extends (...args: any[]) => any>(
  callback: T,
  options?: {
    name?: string;
    fallbackReturn?: ReturnType<T>;
    shouldThrow?: boolean;
    dependencies?: any[];
  }
) {
  const {
    name = 'Anonymous',
    fallbackReturn,
    shouldThrow = false,
    dependencies = [],
  } = options || {};

  return useCallback(
    safeCallback(callback, {
      name,
      fallbackReturn,
      shouldThrow,
    }),
    [...dependencies]
  );
}

/**
 * Hook for handling promise rejections with custom error handling.
 */
/** Handles promise rejections with custom error handling and optional throwing. */
export function useSafePromise<T>(
  promise: Promise<T>,
  options?: {
    operation?: string;
    onReject?: (error: Error) => void;
    shouldThrow?: boolean;
    dependencies?: any[];
  }
) {
  const { operation = 'Unknown', onReject, shouldThrow = false, dependencies = [] } = options || {};

  useEffect(() => {
    handlePromiseRejection(promise, {
      operation,
      onReject,
      shouldThrow,
    }).catch(() => {
      // Already logged
    });
  }, [...dependencies]);
}

/**
 * Hook to mark intentional error suppression in cleanup code.
 */
/** Marks intentional error suppression for cleanup and recovery code paths. */
export function useSuppressError(reason: string, suppression: ErrorSuppression = 'intentional') {
  return useCallback(() => {
    suppressError(reason, suppression);
  }, [reason, suppression]);
}

/**
 * Hook for comprehensive error handling in async effects.
 */
/** Executes async effects with error recovery, cleanup, and fallback handling. */
export function useAsyncEffect<T>(
  effect: () => Promise<T | void>,
  options?: {
    operation?: string;
    cleanup?: () => void;
    fallback?: () => void;
    dependencies?: any[];
  }
) {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current = new AbortController();

    (async () => {
      try {
        await withErrorRecovery(effect, {
          operation: options?.operation || 'Async effect',
          shouldThrow: false,
        });
      } catch (error) {
        log.error(`Async effect failed: ${options?.operation || 'Unknown'}`, error);
        options?.fallback?.();
      }
    })();

    return () => {
      abortRef.current?.abort();
      options?.cleanup?.();
    };
  }, options?.dependencies);
}

/**
 * Hook to track errors in a component lifecycle.
 */
/** Tracks errors throughout component lifecycle with history and retrieval capabilities. */
export function useErrorTracking() {
  const errorsRef = useRef<Array<{ error: Error; timestamp: number }>>([]);

  const trackError = useCallback((error: Error | unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    errorsRef.current.push({
      error: err,
      timestamp: Date.now(),
    });

    if (errorsRef.current.length > 50) {
      errorsRef.current = errorsRef.current.slice(-50);
    }

    log.warn('Error tracked in component', { error: err.message });
  }, []);

  const getErrors = useCallback(() => {
    return [...errorsRef.current];
  }, []);

  const clearErrors = useCallback(() => {
    errorsRef.current = [];
  }, []);

  return { trackError, getErrors, clearErrors };
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION 3: Advanced Retry Strategy with Metrics (useRetryStrategy consolidation)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hook for executing async operations with automatic retry strategy
 */
/** Executes async operations with automatic retry strategy and metrics tracking. */
export function useRetryableAsync<T>(
  fn: () => Promise<T>,
  options?: {
    operationName?: string;
    config?: RetryConfig;
    shouldRetry?: RetryPolicy;
    dependencies?: any[];
  }
) {
  const {
    operationName = 'Unknown',
    config = RETRY_CONFIG_TRANSIENT,
    shouldRetry,
    dependencies = [],
  } = options || {};

  const executorRef = useRef<RetryExecutor>(new RetryExecutor(config, operationName));

  useEffect(() => {
    retryMetricsTracker.registerExecutor(operationName, executorRef.current);
  }, [operationName]);

  const execute = useCallback(async () => {
    try {
      return await executorRef.current.execute(fn, shouldRetry);
    } catch (error) {
      log.error(`Retry exhausted for ${operationName}:`, error);
      throw error;
    }
  }, [operationName, ...dependencies]);

  const getMetrics = useCallback(() => {
    return executorRef.current.getMetrics();
  }, []);

  return { execute, getMetrics };
}

/**
 * Hook for tracking retry metrics in a component
 */
/** Tracks retry metrics for a specific operation with periodic updates. */
export function useRetryMetrics(operationName?: string) {
  const [metrics, setMetrics] = useState<RetryMetrics | undefined>(undefined);

  const updateMetrics = useCallback(() => {
    if (operationName) {
      const m = retryMetricsTracker.getMetrics(operationName);
      setMetrics(m);
    }
  }, [operationName]);

  useEffect(() => {
    const interval = setInterval(updateMetrics, 5000);
    return () => clearInterval(interval);
  }, [updateMetrics]);

  return metrics;
}

/**
 * Hook for monitoring all retry operations
 */
/** Monitors all retry operations globally with health status tracking. */
export function useGlobalRetryMetrics() {
  const [allMetrics, setAllMetrics] = useState<Map<string, RetryMetrics>>(new Map());
  const [healthStatus, setHealthStatus] = useState({ healthy: [], degraded: [] });

  useEffect(() => {
    const interval = setInterval(() => {
      setAllMetrics(new Map(retryMetricsTracker.getAllMetrics()));
      setHealthStatus(retryMetricsTracker.getHealthStatus());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return { allMetrics, healthStatus };
}

/**
 * Hook for retry strategy with exponential backoff
 */
/** Provides retry configuration with exponential backoff strategy. */
export function useExponentialBackoff(config?: Partial<RetryConfig>) {
  const defaultConfig: RetryConfig = {
    ...RETRY_CONFIG_TRANSIENT,
    ...config,
  };

  return defaultConfig;
}

/**
 * Hook for API retry strategy (higher attempt count)
 */
/** Provides retry configuration optimized for API calls with higher attempt count. */
export function useApiRetryStrategy(config?: Partial<RetryConfig>) {
  const defaultConfig: RetryConfig = {
    ...RETRY_CONFIG_API,
    ...config,
  };

  return defaultConfig;
}

/**
 * Hook for database retry strategy (lower delay)
 */
/** Provides retry configuration optimized for database operations with lower delays. */
export function useDatabaseRetryStrategy(config?: Partial<RetryConfig>) {
  const defaultConfig: RetryConfig = {
    ...RETRY_CONFIG_DATABASE,
    ...config,
  };

  return defaultConfig;
}

/**
 * Hook for long-running async retry strategy
 */
/** Provides retry configuration optimized for long-running async operations. */
export function useAsyncRetryStrategy(config?: Partial<RetryConfig>) {
  const defaultConfig: RetryConfig = {
    ...RETRY_CONFIG_ASYNC,
    ...config,
  };

  return defaultConfig;
}

// ──────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY RE-EXPORTS
// ──────────────────────────────────────────────────────────────────────────

export default {
  useRetryOperation,
  useSafeEventHandler,
  useSafeAsync,
  useSafeRetry,
  useFireAndForget,
  useSafeCallback,
  useSafePromise,
  useSuppressError,
  useAsyncEffect,
  useErrorTracking,
  useRetryableAsync,
  useRetryMetrics,
  useGlobalRetryMetrics,
  useExponentialBackoff,
  useApiRetryStrategy,
  useDatabaseRetryStrategy,
  useAsyncRetryStrategy,
};