import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InstanceMetrics } from '@/lib/retryAlerts';

export interface RetryMetricRow {
  id: string;
  action: string;
  method: string;
  instance_name: string | null;
  idempotency_key: string | null;
  attempt_count: number;
  final_status: 'success' | 'failed' | 'exhausted';
  final_http_status: number | null;
  retry_reasons: Array<{ attempt: number; status?: number; reason: string }>;
  total_duration_ms: number | null;
  created_at: string;
}

export interface RetryAggregates {
  total: number;
  successAfterRetry: number;
  failed: number;
  exhausted: number;
  successRate: number;
  p50Attempts: number;
  p95Attempts: number;
  avgDurationMs: number;
  topActions: Array<{ action: string; count: number }>;
  topReasons: Array<{ reason: string; count: number }>;
}

export interface RetryMetricsResponse {
  rows: RetryMetricRow[];
  aggregates: RetryAggregates;
  previousTotal: number;
  /** Top reasons of the equivalent previous window (same length, same filters). */
  previousTopReasons?: Array<{ reason: string; count: number }>;
  deltaPct: number | null;
  windowHours: number;
}

export interface RetryMetricsFilters {
  hours?: number;
  action?: string | null;
  instance?: string | null;
  status?: 'success' | 'failed' | 'exhausted' | null;
}

export function useRetryMetrics(filters: RetryMetricsFilters = {}) {
  const queryClient = useQueryClient();
  const { hours = 24, action = null, instance = null, status = null } = filters;
  const queryKey = ['evolution-retry-metrics', { hours, action, instance, status }];

  const query = useQuery<RetryMetricsResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('hours', String(hours));
      if (action) params.set('action', action);
      if (instance) params.set('instance', instance);
      if (status) params.set('status', status);

      const { data, error } = await supabase.functions.invoke(
        `evolution-retry-metrics?${params.toString()}`,
        {
          method: 'GET',
        }
      );
      if (error) throw error;
      return data as RetryMetricsResponse; // ignore-audit: narrows Supabase query result to local interface
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Aggregate por instância (client-side, da janela atual)
  const byInstance = useMemo<InstanceMetrics[]>(() => {
    const rows = query.data?.rows ?? [];
    const map = new Map<string, RetryMetricRow[]>();
    for (const r of rows) {
      const key = r.instance_name ?? '(global)';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    const out: InstanceMetrics[] = [];
    for (const [instance, list] of map.entries()) {
      const total = list.length;
      const successAfterRetry = list.filter((r) => r.final_status === 'success').length;
      const failed = list.filter((r) => r.final_status === 'failed').length;
      const exhausted = list.filter((r) => r.final_status === 'exhausted').length;
      const attempts = list.map((r) => r.attempt_count).sort((a, b) => a - b);
      const idx = Math.max(0, Math.ceil(attempts.length * 0.95) - 1);
      const p95Attempts = attempts.length ? attempts[idx] : 0;
      const failureRatePct = total > 0 ? Math.round(((failed + exhausted) / total) * 100) : 0;
      out.push({
        instance,
        total,
        successAfterRetry,
        failed,
        exhausted,
        p95Attempts,
        failureRatePct,
      });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [query.data?.rows]);

  // Realtime: invalida ao receber INSERT
  useEffect(() => {
    const channel = supabase
      .channel('evolution_retry_metrics_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'evo', table: 'evolution_retry_metrics' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['evolution-retry-metrics'] });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);

  return { ...query, byInstance };
}
