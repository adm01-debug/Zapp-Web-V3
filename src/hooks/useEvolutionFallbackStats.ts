import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';

/**
 * Estatísticas de telemetria de fallback FATOR X agregadas pela RPC
 * `rpc_evolution_fallback_stats`. Backed by `public.evolution_fallback_events`,
 * populado pela edge function `evolution-api` quando uma resposta v2.3.7
 * indica condição de fallback (404, payload vazio, etc.).
 *
 * Restrita a admin/supervisor — RLS bloqueia outros papéis.
 */
export interface FallbackStatsRecent {
  ts: string;
  action: string;
  instance: string | null;
  status: number;
  reason: string;
  mode: 'detected' | 'triggered';
  fallback_target: string;
  primary_ms: number | null;
}

export interface FallbackStats {
  window_hours: number;
  total: number;
  total_last_hour: number;
  total_last_7d: number;
  first_event_at: string | null;
  last_event_at: string | null;
  by_action: { action: string; count: number }[];
  by_reason: { reason: string; count: number }[];
  by_instance: { instance: string; count: number }[];
  recent: FallbackStatsRecent[];
}

/** Fetches Evolution API fallback event statistics aggregated by RPC for the specified hour window. */
export function useEvolutionFallbackStats(windowHours = 24) {
  return useQuery<FallbackStats>({
    queryKey: queryKeys.evolutionFallback.statsWindowed(windowHours),
    queryFn: async () => {
      const { data, error } = await safeClient.rpc<FallbackStats>('rpc_evolution_fallback_stats', {
        p_hours: windowHours,
      });
      if (error) throw error;
      return data as FallbackStats; // ignore-audit: narrows Supabase query result to local interface
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
