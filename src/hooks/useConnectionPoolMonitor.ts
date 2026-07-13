// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import type { ConnectionMetrics } from '@/integrations/supabase/connectionPool';
import { getLogger } from '@/lib/logger';

const log = getLogger('useConnectionPoolMonitor');

/**
 * Hook for monitoring Supabase connection pool health.
 * Provides real-time metrics for dashboard display and alerting.
 */
export function useConnectionPoolMonitor() {
  const [metrics, setMetrics] = useState<ConnectionMetrics | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(10000); // 10 seconds default

  const updateMetrics = useCallback(() => {
    try {
      const poolMetrics = safeClient.getPoolMetrics();
      setMetrics(poolMetrics);

      // Alert on critical conditions
      if (poolMetrics.poolUtilization > 0.9) {
        log.warn('High pool utilization detected', {
          utilization: poolMetrics.poolUtilization,
          active: poolMetrics.activeConnections,
          max: poolMetrics.maxConcurrent,
        });
      }

      if (poolMetrics.totalErrors > 10) {
        log.error('Excessive connection errors detected', {
          totalErrors: poolMetrics.totalErrors,
        });
      }

      if (poolMetrics.heapUsageBeforeGc && poolMetrics.heapUsageAfterGc) {
        const heapReduction =
          ((poolMetrics.heapUsageBeforeGc - poolMetrics.heapUsageAfterGc) /
            poolMetrics.heapUsageBeforeGc) *
          100;
        log.info('Garbage collection completed', {
          heapReduction: heapReduction.toFixed(2) + '%',
          before: poolMetrics.heapUsageBeforeGc,
          after: poolMetrics.heapUsageAfterGc,
        });
      }
    } catch (err) {
      log.error('Failed to update pool metrics', err);
    }
  }, []);

  const startMonitoring = useCallback(
    (interval?: number) => {
      if (isMonitoring) return;

      if (interval) {
        setPollingInterval(interval);
      }

      setIsMonitoring(true);
      updateMetrics(); // Initial update
    },
    [isMonitoring, updateMetrics]
  );

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  // Setup polling interval
  useEffect(() => {
    if (!isMonitoring) return;

    const timerId = setInterval(updateMetrics, pollingInterval);

    return () => clearInterval(timerId);
  }, [isMonitoring, pollingInterval, updateMetrics]);

  return {
    metrics,
    isMonitoring,
    pollingInterval,
    startMonitoring,
    stopMonitoring,
    updateMetrics,
    setPollingInterval,
  };
}

/**
 * Hook for getting pool diagnostics (detailed connection info).
 */
export function useConnectionPoolDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<ReturnType<
    typeof safeClient.getPoolDiagnostics
  > | null>(null);

  const getDiagnostics = useCallback(() => {
    try {
      const diag = safeClient.getPoolDiagnostics();
      setDiagnostics(diag);
      return diag;
    } catch (err) {
      log.error('Failed to get pool diagnostics', err);
      return null;
    }
  }, []);

  // Auto-update on mount
  useEffect(() => {
    getDiagnostics();
  }, [getDiagnostics]);

  return {
    diagnostics,
    getDiagnostics,
  };
}

/**
 * Hook for detecting pool exhaustion conditions.
 */
export function useConnectionPoolExhaustionDetector(threshold: number = 0.85) {
  const [isExhausted, setIsExhausted] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const { metrics } = useConnectionPoolMonitor();

  useEffect(() => {
    if (!metrics) return;

    const utilization = metrics.poolUtilization;
    const wasExhausted = isExhausted;

    if (utilization >= threshold) {
      setIsExhausted(true);
      if (!wasExhausted) {
        setAlertCount((prev) => prev + 1);
        log.error('Connection pool exhaustion detected', {
          utilization: (utilization * 100).toFixed(2) + '%',
          threshold: (threshold * 100).toFixed(2) + '%',
        });
      }
    } else if (utilization < threshold * 0.8) {
      setIsExhausted(false);
    }
  }, [metrics, threshold, isExhausted]);

  return {
    isExhausted,
    alertCount,
    utilizationRatio: metrics?.poolUtilization ?? 0,
  };
}
