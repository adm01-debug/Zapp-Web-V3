import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardFilters, DashboardStats, QueueStats, RecentActivity } from './dashboardTypes';

interface ProfileRow { id: string; name: string | null; is_active: boolean | null; role: string | null; }
interface ContactRow { id: string; assigned_to: string | null; queue_id: string | null; updated_at: string; }
interface QueueMemberRow { queue_id: string; profile_id: string; profile: { is_active: boolean | null } | null; }
interface QueueRow { id: string; name: string; color: string | null; queue_members: QueueMemberRow[]; }

export function useDashboardData(filters?: DashboardFilters) {
  const queryClient = useQueryClient();
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
        onlineAgents: (data as ProfileRow[] || []).filter((p) => p.is_active).length,
        totalAgents: (data || []).length,
      };
    },
  });

  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: [
      'dashboard-contacts',
      merged.agentId,
      merged.queueId,
      merged.dateRange.from.toISOString(),
      merged.dateRange.to.toISOString(),
    ],
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id, assigned_to, queue_id, updated_at')
        .gte('updated_at', merged.dateRange.from.toISOString())
        .lte('updated_at', merged.dateRange.to.toISOString());
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

    const contacts = contactsData as ContactRow[];
    const queues = queuesData as QueueRow[];

    const openConversations = contacts.filter((c) => c.assigned_to).length;
    const pendingConversations = contacts.filter(
      (c) => !c.assigned_to && c.queue_id
    ).length;
    const resolvedToday = contacts.filter((c) => {
      const updatedAt = new Date(c.updated_at);
      return updatedAt >= startOfToday && !c.assigned_to;
    }).length;

    const queuesStats: QueueStats[] = queues.map((queue) => {
      const members = queue.queue_members || [];
      const onlineMembers = members.filter(
        (m) => m.profile?.is_active
      ).length;
      const queuePending = contacts.filter(
        (c) => !c.assigned_to && c.queue_id === queue.id
      ).length;
      return {
        id: queue.id,
        name: queue.name,
        color: queue.color,
        waitingCount: queuePending,
        onlineAgents: onlineMembers,
        totalAgents: members.length,
      };
    });

    const recentActivity: RecentActivity[] = contacts.slice(0, 10).map((c) => ({
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
      totalConversations: contacts.length,
      onlineAgents: agentsData.onlineAgents,
      totalAgents: agentsData.totalAgents,
      avgResponseTime: null,
      queuesStats,
      recentActivity,
    };
  }, [contactsData, agentsData, queuesData]);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-agents'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-queues'] });
  }, [queryClient]);

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
