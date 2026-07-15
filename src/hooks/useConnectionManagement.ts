// @ts-nocheck
/**
 * useConnectionManagement.ts (v1.0)
 * Unified connection management consolidating:
 * - useConnectionAlertsPush: Connection alerts via push notifications
 * - useConnectionQueues: Queue management for connections
 * - useConnectionPoolMonitor: Supabase connection pool health monitoring
 *
 * Backward compatibility maintained through re-exports of legacy hook names.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import type { ConnectionMetrics } from '@/integrations/supabase/connectionPool';
import { getLogger } from '@/lib/logger';

const log = getLogger('ConnectionManagement');

// ──────────────────────────────────────────────────────────────────────────
// CONNECTION ALERTS PUSH
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hook for listening to connection alerts via realtime and displaying push notifications.
 * Monitors new connection_alert notifications and shows browser notifications.
 */
export function useConnectionAlertsPush() {
  useEffect(() => {
    if (typeof Notification === 'undefined') return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled || !auth.user) return;

      channel = supabase
        .channel(`connection-alerts-${auth.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'zapp',
            table: 'notifications',
            filter: `user_id=eq.${auth.user.id}`,
          },
          (payload) => {
            const n = payload.new as {
              type?: string;
              title?: string;
              message?: string;
              metadata?: { connection_id?: string; reason?: string; [key: string]: unknown };
            };
            if (n?.type !== 'connection_alert') return;
            if (Notification.permission !== 'granted') return;
            try {
              new Notification(n.title ?? 'Alerta de conexão', {
                body: n.message ?? '',
                icon: '/favicon.ico',
                tag: `conn-${n.metadata?.connection_id ?? 'unknown'}`,
                requireInteraction: n.metadata?.reason === 'disconnected',
              });
            } catch {
              /* ignore */
            }
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void channel.unsubscribe();
        supabase.removeChannel(channel);
      }
    };
  }, []);
}

// ──────────────────────────────────────────────────────────────────────────
// CONNECTION QUEUES
// ──────────────────────────────────────────────────────────────────────────

export interface ConnectionQueue {
  id: string;
  whatsapp_connection_id: string;
  queue_id: string;
  created_at: string;
}

/**
 * Hook for managing queues associated with a WhatsApp connection.
 * Provides CRUD operations for connection queue relationships.
 */
export function useConnectionQueues(connectionId?: string) {
  const [connectionQueues, setConnectionQueues] = useState<ConnectionQueue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchQueues = useCallback(async () => {
    if (!connectionId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_connection_queues')
        .select('*')
        .eq('whatsapp_connection_id', connectionId);
      if (error) throw error;
      setConnectionQueues(data || []);
    } catch (err) {
      log.error('Error fetching connection queues:', err);
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    void fetchQueues();
  }, [fetchQueues]);

  const addQueue = useCallback(async (queueId: string) => {
    if (!connectionId) return;
    try {
      const { error } = await supabase
        .from('whatsapp_connection_queues')
        .insert({ whatsapp_connection_id: connectionId, queue_id: queueId });
      if (error) throw error;
      await fetchQueues();
    } catch (err) {
      log.error('Error adding queue to connection:', err);
      throw err;
    }
  }, [connectionId, fetchQueues]);

  const removeQueue = useCallback(async (queueId: string) => {
    if (!connectionId) return;
    try {
      const { error } = await supabase
        .from('whatsapp_connection_queues')
        .delete()
        .eq('whatsapp_connection_id', connectionId)
        .eq('queue_id', queueId);
      if (error) throw error;
      setConnectionQueues(prev => prev.filter(cq => cq.queue_id !== queueId));
    } catch (err) {
      log.error('Error removing queue from connection:', err);
      throw err;
    }
  }, [connectionId]);

  return { connectionQueues, isLoading, addQueue, removeQueue, refetch: fetchQueues };
}

// ──────────────────────────────────────────────────────────────────────────
// CONNECTION POOL MONITORING
// ──────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY
// ──────────────────────────────────────────────────────────────────────────

export default {
  useConnectionAlertsPush,
  useConnectionQueues,
  useConnectionPoolMonitor,
  useConnectionPoolDiagnostics,
  useConnectionPoolExhaustionDetector,
};
