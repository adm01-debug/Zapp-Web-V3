import { useEffect, useCallback, useRef } from 'react';
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

const log = getLogger('useSilentErrorPrevention');

/**
 * Hook for wrapping event handlers with automatic error logging.
 */
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
        // Error is automatically logged via safeEventListener
      }
    },
    [handler, eventName]
  );
}

/**
 * Hook for safely handling async operations with error recovery.
 */
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
 * Hook for automatically retrying failed operations with exponential backoff.
 */
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
export function useFireAndForget() {
  return useCallback((promise: Promise<any>, operation: string = 'Unknown operation') => {
    fireAndForget(promise, { operation });
  }, []);
}

/**
 * Hook for wrapping callbacks with automatic error logging.
 */
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
export function useSuppressError(reason: string, suppression: ErrorSuppression = 'intentional') {
  return useCallback(() => {
    suppressError(reason, suppression);
  }, [reason, suppression]);
}

/**
 * Hook for comprehensive error handling in async effects.
 */
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
export function useErrorTracking() {
  const errorsRef = useRef<Array<{ error: Error; timestamp: number }>>([]);

  const trackError = useCallback((error: Error | unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    errorsRef.current.push({
      error: err,
      timestamp: Date.now(),
    });

    // Keep only last 50 errors
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

export default {
  useSafeEventHandler,
  useSafeAsync,
  useSafeRetry,
  useFireAndForget,
  useSafeCallback,
  useSafePromise,
  useSuppressError,
  useAsyncEffect,
  useErrorTracking,
};
