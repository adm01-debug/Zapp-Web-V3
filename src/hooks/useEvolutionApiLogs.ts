import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import { queryKeys } from '@/services/api/queryKeys';

export interface RetryMetric {
  id: string;
  action: string;
  method: string;
  instance_name: string | null;
  attempt_count: number;
  final_status: 'success' | 'failed' | 'exhausted';
  final_http_status: number | null;
  retry_reasons: Array<{ attempt: number; reason: string; status?: number }>;
  total_duration_ms: number | null;
  created_at: string;
}

interface UseEvolutionApiLogsOptions {
  hoursBack: string;
  statusFilter: string;
  actionSearch: string;
  instanceFilter: string;
}

export function useEvolutionApiLogs({
  hoursBack,
  statusFilter,
  actionSearch,
  instanceFilter,
}: UseEvolutionApiLogsOptions) {
  const since = useMemo(() => subHours(new Date(), Number(hoursBack)).toISOString(), [hoursBack]);

  const { data, isLoading, refetch, isFetching } = useQuery<RetryMetric[]>({
    queryKey: queryKeys.adminOps.evolutionApiLogsFiltered(
      hoursBack,
      statusFilter,
      actionSearch,
      instanceFilter
    ),
    queryFn: async () => {
      let q = supabase
        .from('evolution_retry_metrics')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

      if (statusFilter !== 'all') q = q.eq('final_status', statusFilter);
      if (actionSearch.trim())
        q = q.ilike('action', `%${sanitizePostgrestFilter(actionSearch.trim())}%`);
      if (instanceFilter.trim()) q = q.eq('instance_name', instanceFilter.trim());

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id ?? '',
        action: row.action ?? '',
        method: row.method ?? '',
        instance_name: row.instance_name,
        attempt_count: row.attempt_count ?? 0,
        final_status:
          row.final_status === 'success' || row.final_status === 'failed' || row.final_status === 'exhausted'
            ? row.final_status
            : 'failed',
        final_http_status: row.final_http_status,
        retry_reasons: Array.isArray(row.retry_reasons)
          ? row.retry_reasons
              .map((r) => {
                if (typeof r !== 'object' || r === null) return null;
                const obj = r as Record<string, unknown>;
                return {
                  attempt: typeof obj.attempt === 'number' ? obj.attempt : 0,
                  reason: typeof obj.reason === 'string' ? obj.reason : '',
                  status: typeof obj.status === 'number' ? obj.status : undefined,
                };
              })
              .filter((r): r is NonNullable<typeof r> => r !== null)
          : [],
        total_duration_ms: row.total_duration_ms,
        created_at: row.created_at ?? '',
      }));
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return { data, isLoading, refetch, isFetching };
}
