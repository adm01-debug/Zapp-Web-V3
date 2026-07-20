import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
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
  const since = useMemo(
    () => subHours(new Date(), Number(hoursBack)).toISOString(),
    [hoursBack],
  );

  const { data, isLoading, refetch, isFetching } = useQuery<RetryMetric[]>({
    queryKey: queryKeys.adminOps.evolutionApiLogsFiltered(
      hoursBack,
      statusFilter,
      actionSearch,
      instanceFilter,
    ),
    queryFn: async () => {
      let q = supabase
        .from('evolution_retry_metrics')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

      if (statusFilter !== 'all') q = q.eq('final_status', statusFilter);
      if (actionSearch.trim()) q = q.ilike('action', `%${actionSearch.trim()}%`);
      if (instanceFilter.trim()) q = q.eq('instance_name', instanceFilter.trim());

      const { data, error } = await q;
      if (error) throw error;
      return (data as RetryMetric[]) ?? []; // ignore-audit: narrows Supabase query result to local interface
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return { data, isLoading, refetch, isFetching };
}
