// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useErrorMonitoringManagement } from '@/hooks/useAnalyticsManagement';

export function useErrorRateMonitoring() {
  return useErrorMonitoringManagement();
          high: newStats.bySeverity.high,
        });
      }

      // Alert on error pattern
      if (newStats.topPatterns.length > 0 && newStats.topPatterns[0].count > 5) {
        log.warn('Recurring error pattern detected', {
          pattern: newStats.topPatterns[0].key,
          occurrences: newStats.topPatterns[0].count,
        });
      }
    } catch (err) {
      log.error('Failed to update error stats', err);
    }
  }, []);

  const startMonitoring = useCallback(
    (interval?: number) => {
      if (isMonitoring) return;
      if (interval) setPollingInterval(interval);
      setIsMonitoring(true);
      updateStats();
    },
    [isMonitoring, updateStats]
  );

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  useEffect(() => {
    if (!isMonitoring) return;
    const timerId = setInterval(updateStats, pollingInterval);
    return () => clearInterval(timerId);
  }, [isMonitoring, pollingInterval, updateStats]);

  return {
    stats,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    updateStats,
    setPollingInterval,
  };
}

/**
 * Hook for wrapping async operations with structured error logging.
 */
export function useAsyncErrorHandler() {
  const handleError = useCallback(
    (
      error: Error | unknown,
      context?: {
        operation?: string;
        userId?: string;
        correlationId?: string;
      }
    ): StructuredError => {
      return logStructuredError(error, {
        userId: context?.userId,
        correlationId: context?.correlationId,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      });
    },
    []
  );

  const executeWithErrorHandling = useCallback(
    async <T>(
      fn: () => Promise<T>,
      context?: { operation?: string; userId?: string; correlationId?: string }
    ): Promise<{ data: T | null; error: StructuredError | null }> => {
      try {
        const data = await fn();
        return { data, error: null };
      } catch (err) {
        const error = handleError(err, context);
        return { data: null, error };
      }
    },
    [handleError]
  );

  return {
    handleError,
    executeWithErrorHandling,
  };
}

/**
 * Hook for global error boundary integration.
 */
export function useGlobalErrorCapture() {
  const handleError = useCallback(
    (error: Error | unknown, errorInfo?: { componentStack?: string }) => {
      logStructuredError(error, {
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      });

      if (errorInfo?.componentStack) {
        log.error('Component stack', { componentStack: errorInfo.componentStack });
      }
    },
    []
  );

  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      handleError(event.reason, { componentStack: 'unhandledRejection' });
    };

    // Handle uncaught errors
    const handleError_ = (event: ErrorEvent) => {
      handleError(event.error, { componentStack: 'uncaughtError' });
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError_);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError_);
    };
  }, [handleError]);

  return { handleError };
}

/**
 * Hook for monitoring fetch/API errors.
 */
export function useApiErrorMonitoring() {
  useEffect(() => {
    // Intercept fetch to capture API errors
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource, config] = args;
      const method = (config?.method || 'GET').toUpperCase();
      const url = typeof resource === 'string' ? resource : resource.url;

      try {
        const response = await originalFetch(...args);

        if (!response.ok && response.status >= 400) {
          // Log HTTP errors
          const text = await response.clone().text();
          logStructuredError(new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`), {
            method,
            url,
            statusCode: response.status,
          });
        }

        return response;
      } catch (err) {
        // Log network errors
        logStructuredError(err, {
          method,
          url,
        });
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);
}
