import { getLogger } from '@/lib/logger';
import { logStructuredError, type ErrorContext } from '@/lib/structuredErrorLogging';

const log = getLogger('silentErrorPrevention');

/**
 * Silent Error Prevention (MELHORIA #11)
 *
 * Prevents errors from being silently swallowed and ensures comprehensive error tracking.
 *
 * Features:
 * - Detects and logs unhandled promise rejections
 * - Wraps callbacks to prevent silent failures
 * - Safe event listener wrapping with automatic error logging
 * - Typed error suppression markers for intentional ignoring
 * - Async operation guard against unhandled rejections
 * - Error recovery patterns for common failure scenarios
 */

export type ErrorSuppression = 'intentional' | 'expected' | 'recoverable' | 'logged';

/**
 * Marker for intentional error suppression.
 * Signals that this error was caught and suppressed deliberately,
 * not accidentally or due to poor error handling.
 */
export function suppressError(reason: string, suppression: ErrorSuppression = 'intentional'): void {
  log.debug(`Error suppression: ${suppression} - ${reason}`);
}

/**
 * Safe wrapper for async functions that guarantees error logging.
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: {
    operation: string;
    fallback?: T;
    shouldThrow?: boolean;
    errorContext?: Partial<ErrorContext>;
  }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    log.error(`Async operation failed: ${context.operation}`, error);
    logStructuredError(error, {
      ...context.errorContext,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });

    if (context.shouldThrow) throw error;
    if (context.fallback !== undefined) return context.fallback;
    throw error;
  }
}

/**
 * Safe wrapper for callbacks that prevents silent failures.
 */
export function safeCallback<T extends (...args: any[]) => any>(
  callback: T,
  context: {
    name: string;
    fallbackReturn?: ReturnType<T>;
    shouldThrow?: boolean;
  }
): T {
  return ((...args: any[]) => {
    try {
      return callback(...args);
    } catch (error) {
      log.error(`Callback error in ${context.name}:`, error);
      logStructuredError(error, {
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      });

      if (context.shouldThrow) throw error;
      return context.fallbackReturn;
    }
  }) as T;
}

/**
 * Safe wrapper for event listeners that prevents silent failures.
 */
export function safeEventListener<K extends keyof HTMLElementEventMap>(
  handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  context: { eventName: K; shouldThrow?: boolean }
): (this: HTMLElement, ev: HTMLElementEventMap[K]) => any {
  return function (this: HTMLElement, ev: HTMLElementEventMap[K]) {
    try {
      return handler.call(this, ev);
    } catch (error) {
      log.error(`Event listener error for ${String(context.eventName)}:`, error);
      logStructuredError(error, {
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      });

      if (context.shouldThrow) throw error;
    }
  };
}

/**
 * Safe promise handler that ensures rejection handling.
 */
export function handlePromiseRejection<T>(
  promise: Promise<T>,
  context: {
    operation: string;
    onReject?: (error: Error) => void;
    shouldThrow?: boolean;
  }
): Promise<T | void> {
  return promise.catch((error) => {
    log.error(`Promise rejected in ${context.operation}:`, error);
    logStructuredError(error, {
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });

    context.onReject?.(error instanceof Error ? error : new Error(String(error)));

    if (context.shouldThrow) throw error;
  });
}

/**
 * Guard for fire-and-forget promises that logs rejections.
 */
export function fireAndForget<T>(
  promise: Promise<T>,
  context: {
    operation: string;
    onError?: (error: Error) => void;
  }
): void {
  handlePromiseRejection(promise, {
    ...context,
    shouldThrow: false,
    onReject: context.onError,
  }).catch(() => {
    // Already logged above
  });
}

/**
 * Retry logic with error tracking.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: {
    operation: string;
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  }
): Promise<T> {
  const maxAttempts = context.maxAttempts ?? 3;
  const delayMs = context.delayMs ?? 100;
  const backoffMultiplier = context.backoffMultiplier ?? 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (
        attempt < maxAttempts &&
        (!context.shouldRetry || context.shouldRetry(lastError, attempt))
      ) {
        const delayTime = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayTime));
        log.debug(`Retry attempt ${attempt}/${maxAttempts} for ${context.operation}`);
      }
    }
  }

  log.error(`All retry attempts exhausted for ${context.operation}`, lastError);
  logStructuredError(lastError || new Error('Unknown retry failure'), {
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  });

  throw lastError || new Error(`Failed after ${maxAttempts} attempts`);
}

/**
 * Try-catch wrapper that always logs and provides recovery options.
 */
export async function withErrorRecovery<T>(
  fn: () => Promise<T>,
  context: {
    operation: string;
    fallback?: T;
    recovery?: (error: Error) => Promise<T>;
    shouldThrow?: boolean;
    errorContext?: Partial<ErrorContext>;
  }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error(`Error in ${context.operation}:`, err);
    logStructuredError(err, {
      ...context.errorContext,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });

    if (context.recovery) {
      try {
        log.info(`Attempting recovery for ${context.operation}`);
        return await context.recovery(err);
      } catch (recoveryError) {
        log.error(`Recovery failed for ${context.operation}:`, recoveryError);
        logStructuredError(recoveryError, {
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        });
      }
    }

    if (context.shouldThrow) throw err;
    if (context.fallback !== undefined) return context.fallback;
    throw err;
  }
}

/**
 * Detector for common silent error patterns.
 * Should be called in development to identify problematic error handling.
 */
export function detectSilentErrors(): void {
  if (typeof window === 'undefined') return;

  const detectedIssues: string[] = [];

  // Check for console.error calls that might be swallowed
  const originalError = console.error;
  let errorCount = 0;
  console.error = function (...args: any[]) {
    errorCount++;
    if (errorCount > 10 && errorCount % 10 === 0) {
      detectedIssues.push(
        `High error volume detected: ${errorCount} console.error calls (might indicate silent error swallowing)`
      );
    }
    return originalError.apply(console, args);
  };

  // Report findings
  if (detectedIssues.length > 0) {
    log.warn('Silent error detection found issues:', { issues: detectedIssues });
  }
}

/**
 * Initialize global silent error prevention.
 * Should be called once on application startup.
 */
export function initializeSilentErrorPrevention(): void {
  if (typeof window === 'undefined') return;

  // Track unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    log.error('Unhandled promise rejection detected:', error);
    logStructuredError(error, {
      url: window.location.href,
    });
  });

  // Track uncaught errors
  window.addEventListener('error', (event) => {
    if (event.error) {
      log.error('Uncaught error detected:', event.error);
      logStructuredError(event.error, {
        url: window.location.href,
      });
    }
  });

  // Initialize silent error detection in development
  if (import.meta.env.DEV) {
    detectSilentErrors();
  }

  log.info('Silent error prevention initialized');
}

export default {
  suppressError,
  safeAsync,
  safeCallback,
  safeEventListener,
  handlePromiseRejection,
  fireAndForget,
  retryWithBackoff,
  withErrorRecovery,
  initializeSilentErrorPrevention,
};
