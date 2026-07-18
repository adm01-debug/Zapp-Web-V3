import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardFilters, DashboardStats, QueueStats, RecentActivity } from './dashboardTypes';

export function useDashboardData(filters?: DashboardFilters) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const merged = {
    dateRange: { from: startOfToday, to: endOfToday },
    queueId: null,
    agentId: null,
    ...filters,
  };

  const { data: agentsData, isLoading: loadingAgents } = useQuery({
    queryKey: ['dashboard-agents', merged.agentId],
    queryFn: async () => {
      let query = supabase.from('profiles').select('id, name, is_active, role');
      if (merged.agentId) query = query.eq('id', merged.agentId);
      const { data, error } = await query;
      if (error) throw error;
      return {
        onlineAgents: (data || []).filter((p: any) => p.is_active).length,
        totalAgents: (data || []).length,
      };
    },
  });

  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ['dashboard-contacts', merged.agentId, merged.queueId],
    queryFn: async () => {
      let query = supabase.from('contacts').select('id, assigned_to, queue_id, updated_at');
      if (merged.queueId) query = query.eq('queue_id', merged.queueId);
      if (merged.agentId) query = query.eq('assigned_to', merged.agentId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: queuesData, isLoading: loadingQueues } = useQuery({
    queryKey: ['dashboard-queues', merged.queueId],
    queryFn: async () => {
      let query = supabase
        .from('queues')
        .select('id, name, color, queue_members(queue_id, profile_id, profile:profiles(is_active))');
      if (merged.queueId) query = query.eq('id', merged.queueId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = loadingAgents || loadingContacts || loadingQueues;

  const stats = useMemo((): DashboardStats | null => {
    if (!contactsData || !agentsData || !queuesData) return null;

    const openConversations = (contactsData as any[]).filter((c: any) => c.assigned_to).length;
    const pendingConversations = (contactsData as any[]).filter(
      (c: any) => !c.assigned_to && c.queue_id
    ).length;
    const resolvedToday = (contactsData as any[]).filter((c: any) => {
      const updatedAt = new Date(c.updated_at);
      return updatedAt >= startOfToday && !c.assigned_to;
    }).length;

    const queuesStats: QueueStats[] = (queuesData as any[]).map((queue: any) => {
      const members = queue.queue_members || [];
      const onlineMembers = members.filter(
        (m: any) => m.profile?.is_active
      ).length;
      return {
        id: queue.id,
        name: queue.name,
        color: queue.color,
        waitingCount: pendingConversations,
        onlineAgents: onlineMembers,
        totalAgents: members.length,
      };
    });

    const recentActivity: RecentActivity[] = (contactsData as any[]).slice(0, 10).map((c: any) => ({
      id: c.id,
      contactName: 'Contact',
      contactPhone: '',
      contactAvatar: null,
      lastMessage: '',
      timestamp: c.updated_at,
      status: 'unread',
      unreadCount: 0,
    }));

    return {
      openConversations,
      pendingConversations,
      resolvedToday,
      totalConversations: (contactsData as any[]).length,
      onlineAgents: agentsData.onlineAgents,
      totalAgents: agentsData.totalAgents,
      avgResponseTime: null,
      queuesStats,
      recentActivity,
    };
  }, [contactsData, agentsData, queuesData]);

  const refetch = () => {};

  return { stats, isLoading, refetch };
}

export const formatResponseTime = (seconds: number | null): string => {
  if (seconds === null) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}min ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
};

export type { DashboardFilters, DashboardStats, QueueStats, RecentActivity };
