import { useEffect, useMemo, useRef, useState } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { RANGES, ALL_INSTANCES, bucketize } from './hmacAuditHistoryHelpers';
import type { AuditRow, RangeKey } from './hmacAuditHistoryHelpers';

export function useHmacAuditHistory(range: RangeKey, instanceFilter: string, limit: number) {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>(
    'connecting'
  );

  const rangeCfg = useMemo(() => RANGES.find((r) => r.value === range)!, [range]);
  const since = useMemo(() => subHours(new Date(), rangeCfg.hours).toISOString(), [rangeCfg]);

  const queryKey = useMemo(
    () => ['hmac-selftest-audit', range, instanceFilter],
    [range, instanceFilter]
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await safeClient.from<AuditRow>('hmac_selftest_audit', (q) => {
        let query = q
          .select(
            'id, instance, ok, duration_ms, error, message, good_accepted, tampered_rejected, created_at'
          )
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(2000);
        if (instanceFilter !== ALL_INSTANCES) query = query.eq('instance', instanceFilter);
        return query;
      });
      if (error) return [] as AuditRow[];
      return data ?? [];
    },
    retry: false,
    staleTime: 5_000,
    refetchInterval: realtimeStatus === 'live' ? 60_000 : 20_000,
  });

  const { data: instanceOptions } = useQuery({
    queryKey: queryKeys.adminOps.hmacAuditInstancesRange(range),
    queryFn: async () => {
      const { data, error } = await safeClient.from('hmac_selftest_audit', (q) =>
        q.select('instance').gte('created_at', since).not('instance', 'is', null).limit(1000)
      );
      if (error) return [] as string[];
      const set = new Set<string>();
      ((data ?? []) as Array<{ instance: string | null }>).forEach((r) => {
        if (r.instance) set.add(r.instance);
      });
      return Array.from(set).sort();
    },
    retry: false,
    staleTime: 30_000,
  });

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('hmac-selftest-audit-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'hmac_selftest_audit' },
        () => {
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.hmacAudit() });
            void queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.hmacAuditInstances() });
          }, 300);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('offline');
        } else setRealtimeStatus('connecting');
      });
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const rows = data ?? [];
  const visibleRows = rows.slice(0, limit);

  const stats = useMemo(() => {
    const total = rows.length;
    const oks = rows.filter((r) => r.ok).length;
    const fails = total - oks;
    const successRate = total > 0 ? Math.round((oks / total) * 1000) / 10 : 0;
    const avgDuration =
      total > 0 ? Math.round(rows.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / total) : 0;
    return { total, oks, fails, successRate, avgDuration };
  }, [rows]);

  const trendData = useMemo(() => bucketize(rows, rangeCfg.bucket), [rows, rangeCfg.bucket]);

  return {
    rows,
    visibleRows,
    stats,
    trendData,
    rangeCfg,
    instanceOptions: instanceOptions ?? [],
    isLoading,
    isFetching,
    realtimeStatus,
    refetch,
  };
}