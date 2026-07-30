import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardFilters, DashboardStats, QueueStats, RecentActivity } from './dashboardTypes';

/**
 * rpc_dashboard_init — single RPC that replaces 3 individual queries:
 * profiles (agents), contacts, queues+members
 *
 * Reduces dashboard page load from 3 PostgREST calls to 1.
 * Drop-in replacement for useDashboardData with identical return shape.
 */

interface BatchContact {
  id: string;
  name: string | null;
  phone: string | null;
  assigned_to: string | null;
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
}

/** Consolidated dashboard hook — fetches agent stats, contacts, and queue data
 * in a single RPC call. Compatible return shape with useDashboardData. */
export function useDashboardDataBatch(filters?: DashboardFilters) {
  const queryClient = useQueryClient();

  const merged = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    return {
      dateRange: { from: startOfToday, to: endOfToday },
      queueId: null as string | null,
      agentId: null as string | null,
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
      const { data, error } = await supabase.rpc('rpc_dashboard_init', {
        p_agent_id: merged.agentId ?? undefined,
        p_queue_id: merged.queueId ?? undefined,
        p_date_from: merged.dateRange.from.toISOString(),
        p_date_to: merged.dateRange.to.toISOString(),
      });
      if (error) throw error;
      return data as unknown as DashboardInitResult;
    },
    staleTime: 30_000,
  });

  const stats = useMemo((): DashboardStats | null => {
    if (!batchData) return null;

    const { agents, contacts, queues } = batchData;

    const openConversations = contacts.filter((c) => c.assigned_to).length;
    const pendingConversations = contacts.filter((c) => !c.assigned_to && c.queue_id).length;

    const queuesStats: QueueStats[] = queues.map((q) => ({
      id: q.id,
      name: q.name,
      color: q.color,
      waitingCount: q.waiting_count,
      onlineAgents: q.online_members,
      totalAgents: q.total_members,
    }));

    const recentActivity: RecentActivity[] = contacts.slice(0, 10).map((c) => ({
      id: c.id,
      contactName: c.name ?? 'Contact',
      contactPhone: c.phone ?? '',
      contactAvatar: null,
      lastMessage: '',
      timestamp: c.updated_at,
      status: 'unread' as const,
      unreadCount: 0,
    }));

    return {
      openConversations,
      pendingConversations,
      resolvedToday: 0,
      totalConversations: contacts.length,
      onlineAgents: agents.online,
      totalAgents: agents.total,
      avgResponseTime: null,
      queuesStats,
      recentActivity,
    };
  }, [batchData]);

  const refetch = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['dashboard-batch'] });
  }, [queryClient]);

  return { stats, isLoading, refetch };
}

export type { DashboardFilters, DashboardStats, QueueStats, RecentActivity };
