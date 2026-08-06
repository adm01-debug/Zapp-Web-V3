import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * DASHBOARD-03 — KPIs diários.
 *
 * Conecta o painel à view zapp.evolution_daily_metrics (agregado diário mantido
 * por cron no banco). Agrega os últimos N dias de métricas diárias em cards de
 * KPI (totais do período + último valor pontual onde fizer sentido).
 *
 * Hook de domínio (features/dashboard) — o componente de UI não acessa o
 * supabase diretamente (check-data-layer: components/pages com teto 0).
 */

export interface DailyMetricRow {
  metric_date: string | null;
  messages_received: number | null;
  messages_sent: number | null;
  new_contacts: number | null;
  conversations_opened: number | null;
  conversations_resolved: number | null;
  total_contacts: number | null;
  active_contacts: number | null;
  avg_response_time_seconds: number | null;
}

export const DAILY_KPIS_DEFAULT_DAYS = 7;

export function useDailyMetricsKpis(daysBack: number = DAILY_KPIS_DEFAULT_DAYS) {
  return useQuery({
    queryKey: ['dashboard', 'daily-metrics-kpis', daysBack],
    queryFn: async (): Promise<DailyMetricRow[]> => {
      const { data, error: queryError } = await supabase
        .from('evolution_daily_metrics')
        .select(
          'metric_date, messages_received, messages_sent, new_contacts, conversations_opened, conversations_resolved, total_contacts, active_contacts, avg_response_time_seconds'
        )
        .order('metric_date', { ascending: false })
        .limit(daysBack);
      if (queryError) throw queryError;
      return (data ?? []) as DailyMetricRow[];
    },
    staleTime: 5 * 60_000,
  });
}
