import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { toast } from 'sonner';

export interface TelemetryRow {
  id: string;
  operation: string;
  table_name: string | null;
  rpc_name: string | null;
  duration_ms: number;
  record_count: number | null;
  query_limit: number | null;
  query_offset: number | null;
  count_mode: string | null;
  severity: string;
  error_message: string | null;
  user_id: string | null;
  created_at: string;
}

export type SeverityFilter = 'all' | 'slow' | 'very_slow' | 'error';
export type TimeFilter = '1h' | '6h' | '24h' | '7d' | 'custom';

interface UseQueryTelemetryOptions {
  severityFilter: SeverityFilter;
  timeFilter: TimeFilter;
  customDateFrom: Date | undefined;
  customDateTo: Date | undefined;
}

function getTimeThreshold(
  timeFilter: TimeFilter,
  customDateFrom: Date | undefined,
  customDateTo: Date | undefined
): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (timeFilter === 'custom' && customDateFrom && customDateTo) {
    const endOfDay = new Date(customDateTo);
    endOfDay.setHours(23, 59, 59, 999);
    return { from: customDateFrom.toISOString(), to: endOfDay.toISOString() };
  }
  const ms =
    timeFilter === '1h'
      ? 3_600_000
      : timeFilter === '6h'
        ? 21_600_000
        : timeFilter === '24h'
          ? 86_400_000
          : 604_800_000;
  return { from: new Date(now.getTime() - ms).toISOString(), to };
}

export function useQueryTelemetry({
  severityFilter,
  timeFilter,
  customDateFrom,
  customDateTo,
}: UseQueryTelemetryOptions) {
  const { data: rows = [], isLoading, refetch, isRefetching } = useQuery<TelemetryRow[]>({
    queryKey: queryKeys.adminOps.telemetry(
      severityFilter,
      timeFilter,
      customDateFrom?.toISOString(),
      customDateTo?.toISOString()
    ),
    queryFn: async () => {
      const { from, to } = getTimeThreshold(timeFilter, customDateFrom, customDateTo);
      let query = supabase
        .from('query_telemetry')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(500);

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as TelemetryRow[]) || [];
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const handleCleanup = async () => {
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('query_telemetry')
      .delete()
      .lt('created_at', threshold);
    if (error) toast.error('Erro ao limpar dados antigos');
    else {
      toast.success('Dados com mais de 7 dias removidos');
      refetch();
    }
  };

  return { rows, isLoading, refetch, isRefetching, handleCleanup };
}
