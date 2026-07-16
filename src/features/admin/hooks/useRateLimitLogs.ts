import { queryKeys } from '@/services/api/queryKeys';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RateLimitLog {
  id: string;
  ip_address: string;
  endpoint: string;
  user_id: string | null;
  request_count: number;
  blocked: boolean;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  created_at: string;
}

interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  uniqueIPs: number;
  topEndpoints: { endpoint: string; count: number }[];
  topIPs: { ip: string; count: number; blocked: boolean }[];
}

export type RateLimitSortKey = 'created_at' | 'ip_address' | 'endpoint' | 'request_count' | 'blocked';
export type RateLimitSortDir = 'asc' | 'desc';

export interface RateLimitLogsFilters {
  ip?: string;
  endpoint?: string;
  blockedOnly?: boolean;
  page: number;
  pageSize: number;
  sortBy: RateLimitSortKey;
  sortDir: RateLimitSortDir;
}

export const DEFAULT_FILTERS: RateLimitLogsFilters = {
  ip: '',
  endpoint: '',
  blockedOnly: false,
  page: 1,
  pageSize: 25,
  sortBy: 'created_at',
  sortDir: 'desc',
};

// Cast select strings to plain string so supabase-js does not parse them at the
// type level — keeps tsgo fast even with multiple builder branches.
const sel = (s: string): string => s;
const LOGS_COLUMNS = sel(
  'id, ip_address, endpoint, user_id, request_count, blocked, user_agent, country, city, created_at',
);

const STATS_KEY = ['admin', 'rate-limit-logs', 'stats'] as const;

function stableFilterKey(f: RateLimitLogsFilters) {
  return [
    'admin',
    'rate-limit-logs',
    'page',
    f.page,
    f.pageSize,
    f.sortBy,
    f.sortDir,
    (f.ip ?? '').trim().toLowerCase(),
    (f.endpoint ?? '').trim().toLowerCase(),
    f.blockedOnly ? 'blocked' : 'all',
  ] as const;
}

interface UseRateLimitLogsResult {
  logs: RateLimitLog[];
  stats: RateLimitStats | null;
  total: number;
  totalPages: number;
  loading: boolean;
  filters: RateLimitLogsFilters;
  setFilters: (patch: Partial<RateLimitLogsFilters>) => void;
  resetFilters: () => void;
  refetch: () => void;
}

export function useRateLimitLogs(initial?: Partial<RateLimitLogsFilters>): UseRateLimitLogsResult {
  const queryClient = useQueryClient();
  const [filters, setFiltersState] = useState<RateLimitLogsFilters>({
    ...DEFAULT_FILTERS,
    ...initial,
  });

  const setFilters = useCallback((patch: Partial<RateLimitLogsFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      // Any filter/sort change resets to page 1 unless caller explicitly set page.
      if (
        patch.page === undefined &&
        (patch.ip !== undefined ||
          patch.endpoint !== undefined ||
          patch.blockedOnly !== undefined ||
          patch.pageSize !== undefined ||
          patch.sortBy !== undefined ||
          patch.sortDir !== undefined)
      ) {
        next.page = 1;
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => setFiltersState(DEFAULT_FILTERS), []);

  const pageQueryKey = useMemo(() => stableFilterKey(filters), [filters]);

  const {
    data,
    isFetching: pageLoading,
    refetch: refetchPage,
  } = useQuery<{ rows: RateLimitLog[]; total: number }>({
    queryKey: pageQueryKey,
    queryFn: async () => {
      const from = (filters.page - 1) * filters.pageSize;
      const to = from + filters.pageSize - 1;

      let q = supabase
        .from('rate_limit_logs')
        .select(LOGS_COLUMNS, { count: 'exact' });

      const ip = (filters.ip ?? '').trim();
      const ep = (filters.endpoint ?? '').trim();
      if (ip) q = q.ilike('ip_address', `%${ip}%`);
      if (ep) q = q.ilike('endpoint', `%${ep}%`);
      if (filters.blockedOnly) q = (q as unknown as { eq: (c: string, v: unknown) => typeof q }).eq('blocked', true);

      q = q.order(filters.sortBy, { ascending: filters.sortDir === 'asc' }).range(from, to);

      const { data: rows, count, error } = await q.returns<RateLimitLog[]>();
      if (error) throw error;
      return { rows: rows ?? [], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });

  const {
    data: statsSource = [],
    isFetching: statsLoading,
    refetch: refetchStats,
  } = useQuery<RateLimitLog[]>({
    queryKey: STATS_KEY,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('rate_limit_logs')
        .select(LOGS_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<RateLimitLog[]>();
      if (error) throw error;
      return rows ?? [];
    },
    staleTime: 30_000,
  });

  // Realtime: invalidate paginated cache; prepend into stats snapshot for freshness.
  useEffect(() => {
    const channel = supabase
      .channel('rate-limit-logs')
      .on<RateLimitLog>(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'rate_limit_logs' },
        (payload) => {
          queryClient.setQueryData<RateLimitLog[]>(STATS_KEY, (prev) =>
            [payload.new, ...(prev ?? [])].slice(0, 200),
          );
          queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.rateLimitLogs('page') });
        },
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const stats = useMemo<RateLimitStats | null>(() => {
    if (statsSource.length === 0) return null;
    const totalRequests = statsSource.reduce((sum, log) => sum + log.request_count, 0);
    const blockedRequests = statsSource.filter((log) => log.blocked).length;
    const uniqueIPs = new Set(statsSource.map((log) => log.ip_address)).size;

    const endpointCounts: Record<string, number> = {};
    for (const log of statsSource) {
      endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + log.request_count;
    }
    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const ipData: Record<string, { count: number; blocked: boolean }> = {};
    for (const log of statsSource) {
      if (!ipData[log.ip_address]) ipData[log.ip_address] = { count: 0, blocked: false };
      ipData[log.ip_address].count += log.request_count;
      if (log.blocked) ipData[log.ip_address].blocked = true;
    }
    const topIPs = Object.entries(ipData)
      .map(([ip, { count, blocked }]) => ({ ip, count, blocked }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { totalRequests, blockedRequests, uniqueIPs, topEndpoints, topIPs };
  }, [statsSource]);

  const refetch = useCallback(() => {
    void refetchPage();
    void refetchStats();
  }, [refetchPage, refetchStats]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  return {
    logs: data?.rows ?? [],
    stats,
    total,
    totalPages,
    loading: pageLoading || statsLoading,
    filters,
    setFilters,
    resetFilters,
    refetch,
  };
}
