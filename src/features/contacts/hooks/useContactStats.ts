import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';

/** Hook: Contact Stats Data. */
export interface ContactStatsData {
  total: number;
  with_email: number;
  with_company: number;
  by_lead_status: Record<string, number>;
  by_instance: Record<string, number>;
  pending_lgpd_deletion: number;
  recent_30d: number;
  duplicate_candidates: number;
}

interface UseContactStatsReturn {
  stats: ContactStatsData | null;
  isLoading: boolean;
  error: Error | null;
  hasDuplicates: boolean;
  hasLgpdPending: boolean;
  growthPct30d: number | null;
  refresh: () => Promise<void>;
}

const CONTACT_STATS_KEY = ['contact-stats'] as const;

/** Hook: use Contact Stats. */
export function useContactStats(): UseContactStatsReturn {
  const queryClient = useQueryClient();

  const { data: stats = null, isLoading, error } = useQuery({
    queryKey: CONTACT_STATS_KEY,
    queryFn: async (): Promise<ContactStatsData | null> => {
      const { data, error: rpcErr } = await safeClient.rpc<ContactStatsData>('rpc_contact_stats');
      if (rpcErr) throw new Error(rpcErr.message);
      return data;
    },
    staleTime: 30_000,
  });

  const hasDuplicates = (stats?.duplicate_candidates ?? 0) > 0;
  const hasLgpdPending = (stats?.pending_lgpd_deletion ?? 0) > 0;

  const growthPct30d: number | null = (() => {
    if (!stats) return null;
    const base = stats.total - stats.recent_30d;
    if (base <= 0) return null;
    return Math.round((stats.recent_30d / base) * 100);
  })();

  const refresh = useCallback(
    async () => { void queryClient.invalidateQueries({ queryKey: CONTACT_STATS_KEY }); },
    [queryClient]
  );

  return {
    stats,
    isLoading,
    error: error as Error | null,
    hasDuplicates,
    hasLgpdPending,
    growthPct30d,
    refresh,
  };
}
