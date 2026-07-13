// @ts-nocheck
import { useCallback, useRef, useEffect, useState } from 'react';
import { getLogger } from '@/lib/logger';
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

const log = getLogger('useRetryStrategy');

/**
 * Hook for executing async operations with automatic retry strategy
 */
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
export function useAsyncRetryStrategy(config?: Partial<RetryConfig>) {
  const defaultConfig: RetryConfig = {
    ...RETRY_CONFIG_ASYNC,
    ...config,
  };

  return defaultConfig;
}

export default {
  useRetryableAsync,
  useRetryMetrics,
  useGlobalRetryMetrics,
  useExponentialBackoff,
  useApiRetryStrategy,
  useDatabaseRetryStrategy,
  useAsyncRetryStrategy,
};
