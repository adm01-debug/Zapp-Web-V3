import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardFilters, DashboardStats, QueueStats, RecentActivity } from './dashboardTypes';

/**
 * useDashboardDataBatch — single RPC call replacing 3 individual queries.
 *
 * Calls public.rpc_dashboard_init() which returns:
 *   - agents: { online, total }
 *   - contacts: array filtered by date range (LIMIT 1000 safety valve)
 *   - queues: with total_members, online_members, waiting_count
 *
 * v2.0 — fixes:
 *   - contacts.assigned_to is varchar; rpc handles cast internally (p_agent_id::text)
 *   - LIMIT 1000 on contacts prevents memory blow-up on wide date windows
 *   - Compatible return shape with original useDashboardData hook
 */

interface BatchContact {
  id: string;
  name: string | null;
  phone: string | null;
  assigned_to: string | null;  // varchar in DB
  queue_id: string | null;
  updated_at: string;
}

interface BatchQueue {
  id: string;
  name: string;
  color: string | null;
  total_members: number;
  online_members: number;
  waiting_count: number;
}

interface DashboardInitResult {
  agents: { online: number; total: number };
  contacts: BatchContact[];
  queues: BatchQueue[];
  filters: {
    date_from: string;
    date_to: string;
    agent_id: string | null;
    queue_id: string | null;
  };
  fetched_at: string;
  error?: string;
}

/**
 * Drop-in replacement for useDashboardData — fetches all dashboard data
 * in a single RPC call instead of 3 separate PostgREST calls.
 */
export function useDashboardDataBatch(filters?: DashboardFilters) {
  const queryClient = useQueryClient();

  const merged = useMemo(() => {
    const now         = new Date();
    const startOfDay  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay    = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    return {
      dateRange: { from: startOfDay, to: endOfDay },
      queueId:   null as string | null,
      agentId:   null as string | null,
      ...filters,
    };
  }, [filters]);

  const { data: batchData, isLoading } = useQuery({
    queryKey: [
      'dashboard-batch',
      merged.agentId,
      merged.queueId,
      merged.dateRange.from.toISOString(),
      merged.dateRange.to.toISOString(),
    ],
    queryFn: async (): Promise<DashboardInitResult> => {
      const { data, error } = await (supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      }).rpc('rpc_dashboard_init', {
        p_agent_id:  merged.agentId  ?? undefined,
        p_queue_id:  merged.queueId  ?? undefined,
        p_date_from: merged.dateRange.from.toISOString(),
        p_date_to:   merged.dateRange.to.toISOString(),
      });
      if (error) throw error;
      return data as unknown as DashboardInitResult;
    },
    staleTime: 30_000,
  });

  const stats = useMemo((): DashboardStats | null => {
    if (!batchData) return null;

    const { agents, contacts, queues } = batchData;

    const openConversations    = contacts.filter((c) => !!c.assigned_to).length;
    const pendingConversations = contacts.filter((c) => !c.assigned_to && !!c.queue_id).length;

    const queuesStats: QueueStats[] = queues.map((q) => ({
      id:            q.id,
      name:          q.name,
      color:         q.color,
      waitingCount:  q.waiting_count,
      onlineAgents:  q.online_members,
      totalAgents:   q.total_members,
    }));

    const recentActivity: RecentActivity[] = contacts.slice(0, 10).map((c) => ({
      id:            c.id,
      contactName:   c.name   ?? 'Contact',
      contactPhone:  c.phone  ?? '',
      contactAvatar: null,
      lastMessage:   '',
      timestamp:     c.updated_at,
      status:        'unread' as const,
      unreadCount:   0,
    }));

    return {
      openConversations,
      pendingConversations,
      resolvedToday:      0,
      totalConversations: contacts.length,
      onlineAgents:       agents.online,
      totalAgents:        agents.total,
      avgResponseTime:    null,
      queuesStats,
      recentActivity,
    };
  }, [batchData]);

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['dashboard-batch'] }),
    [queryClient]
  );

  return { stats, isLoading, refetch };
}

export type { DashboardFilters, DashboardStats, QueueStats, RecentActivity };
