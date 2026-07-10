import { useMemo } from 'react';
import { startOfDay, endOfDay } from 'date-fns';
import {
  useAgentsQuery, useContactsQuery, useMessagesQuery,
  useQueuesQuery, useContactsPerQueueQuery, useSlaQuery,
} from './useDashboardQueries';

export interface DashboardFilters {
  dateRange?: { from: Date; to: Date };
  queueId?: string | null;
  agentId?: string | null;
}

export interface DashboardStats {
  openConversations: number;
  pendingConversations: number;
  resolvedToday: number;
  totalConversations: number;
  onlineAgents: number;
  totalAgents: number;
  avgResponseTime: number | null;
  queuesStats: QueueStats[];
  recentActivity: RecentActivity[];
}

export interface QueueStats {
  id: string; name: string; color: string;
  waitingCount: number; onlineAgents: number; totalAgents: number;
}

export interface RecentActivity {
  id: string; contactName: string; contactPhone: string;
  contactAvatar: string | null; lastMessage: string;
  timestamp: string; status: string; unreadCount: number;
}

const getDefaultFilters = (): DashboardFilters => ({
  dateRange: { from: startOfDay(new Date()), to: endOfDay(new Date()) },
  queueId: null, agentId: null,
});

export const useDashboardData = (filters: DashboardFilters = getDefaultFilters()) => {
  const merged = { ...getDefaultFilters(), ...filters };
  const agentsQuery = useAgentsQuery(merged.agentId);
  const contactsQuery = useContactsQuery(merged);
  const messagesQuery = useMessagesQuery(merged);
  const queuesQuery = useQueuesQuery();
  const contactsPerQueueQuery = useContactsPerQueueQuery();
  const slaQuery = useSlaQuery();

  const stats: DashboardStats | null = useMemo(() => {
    if (!contactsQuery.data || !agentsQuery.data || !queuesQuery.data) return null;
    const contacts = contactsQuery.data;
    const messages = messagesQuery.data || [];
    const queues = queuesQuery.data;
    const queueCounts = contactsPerQueueQuery.data || {};
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const openConversations = contacts.filter(c => c.assigned_to).length;
    const pendingConversations = contacts.filter(c => !c.assigned_to && c.queue_id).length;
    const resolvedToday = contacts.filter(c => {
      const updatedAt = new Date(c.updated_at);
      return updatedAt >= today && !c.assigned_to;
    }).length;

    const queuesStats: QueueStats[] = queues.map(queue => {
      const members = queue.queue_members || [];
      const onlineMembers = members.filter((m: { is_active?: boolean; profiles?: { is_active?: boolean } }) =>
        m.is_active && m.profiles?.is_active
      ).length;
      return {
        id: queue.id, name: queue.name, color: queue.color,
        waitingCount: queueCounts[queue.id] || 0, onlineAgents: onlineMembers, totalAgents: members.length,
      };
    });

    const contactMessages = new Map<string, { id: string; contact_id: string; content: string; created_at: string; is_read: boolean | null; contacts?: { name?: string; phone?: string; avatar_url?: string | null } | null }>();
    messages.forEach((msg) => {
      const m = msg as typeof contactMessages extends Map<string, infer V> ? V : never;
      if (!contactMessages.has(m.contact_id)) contactMessages.set(m.contact_id, m);
    });

    const recentActivity: RecentActivity[] = Array.from(contactMessages.values()).slice(0, 10).map(msg => ({
      id: msg.id, contactName: msg.contacts?.name || 'Desconhecido',
      contactPhone: msg.contacts?.phone || '', contactAvatar: msg.contacts?.avatar_url ?? null,
      lastMessage: msg.content, timestamp: msg.created_at,
      status: msg.is_read ? 'read' : 'unread', unreadCount: msg.is_read ? 0 : 1,
    }));

    return {
      openConversations, pendingConversations, resolvedToday,
      totalConversations: contacts.length, onlineAgents: agentsQuery.data.onlineAgents,
      totalAgents: agentsQuery.data.totalAgents, avgResponseTime: slaQuery.data?.avgResponseTime || null,
      queuesStats, recentActivity,
    };
  }, [contactsQuery.data, agentsQuery.data, queuesQuery.data, messagesQuery.data, contactsPerQueueQuery.data, slaQuery.data]);

  return {
    stats,
    isLoading: agentsQuery.isLoading || contactsQuery.isLoading || queuesQuery.isLoading,
    error: agentsQuery.error || contactsQuery.error || queuesQuery.error,
    refetch: () => {
      agentsQuery.refetch(); contactsQuery.refetch(); messagesQuery.refetch();
      queuesQuery.refetch(); contactsPerQueueQuery.refetch(); slaQuery.refetch();
    },
  };
};

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
