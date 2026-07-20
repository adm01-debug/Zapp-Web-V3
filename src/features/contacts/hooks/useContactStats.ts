import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Hook: use Contact Stats. */
export function useContactStats(): UseContactStatsReturn {
  const [stats, setStats] = useState<ContactStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await safeClient.rpc<ContactStatsData>('rpc_contact_stats');

      if (!mountedRef.current) return;
      if (rpcErr) throw new Error(rpcErr.message);

      setStats(data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  // Métricas derivadas
  const hasDuplicates = (stats?.duplicate_candidates ?? 0) > 0;
  const hasLgpdPending = (stats?.pending_lgpd_deletion ?? 0) > 0;

  // Crescimento percentual: recent_30d / (total - recent_30d) * 100
  const growthPct30d: number | null = (() => {
    if (!stats) return null;
    const base = stats.total - stats.recent_30d;
    if (base <= 0) return null;
    return Math.round((stats.recent_30d / base) * 100);
  })();

  return {
    stats,
    isLoading,
    error,
    hasDuplicates,
    hasLgpdPending,
    growthPct30d,
    refresh: fetch,
  };
}
