
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RateLimitLog {
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

const QUERY_KEY = ['admin', 'rate-limit-logs'] as const;

export function useRateLimitLogs() {
  const queryClient = useQueryClient();

  const {
    data: logs = [],
    isFetching: loading,
    refetch,
  } = useQuery<RateLimitLog[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_limit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) return data as RateLimitLog[]; // ignore-audit: narrows Supabase query result to local interface
      return [];
    },
  });

  // Realtime: prepend new inserts directly into the cache without a full re-fetch.
  useEffect(() => {
    const channel = supabase
      .channel('rate-limit-logs')
      .on<RateLimitLog>(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'rate_limit_logs' },
        (payload) => {
          queryClient.setQueryData<RateLimitLog[]>(QUERY_KEY, (prev) =>
            [payload.new, ...(prev ?? [])].slice(0, 100)
          );
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);

  const stats = useMemo<RateLimitStats | null>(() => {
    if (logs.length === 0) return null;

    const totalRequests = logs.reduce((sum, log) => sum + log.request_count, 0);
    const blockedRequests = logs.filter((log) => log.blocked).length;
    const uniqueIPs = new Set(logs.map((log) => log.ip_address)).size;

    const endpointCounts: Record<string, number> = {};
    logs.forEach((log) => {
      endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + log.request_count;
    });
    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const ipData: Record<string, { count: number; blocked: boolean }> = {};
    logs.forEach((log) => {
      if (!ipData[log.ip_address]) {
        ipData[log.ip_address] = { count: 0, blocked: false };
      }
      ipData[log.ip_address].count += log.request_count;
      if (log.blocked) ipData[log.ip_address].blocked = true;
    });
    const topIPs = Object.entries(ipData)
      .map(([ip, { count, blocked }]) => ({ ip, count, blocked }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { totalRequests, blockedRequests, uniqueIPs, topEndpoints, topIPs };
  }, [logs]);

  return {
    logs,
    stats,
    loading,
    refetch,
  };
}