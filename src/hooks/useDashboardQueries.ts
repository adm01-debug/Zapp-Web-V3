import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { DashboardFilters } from './useDashboardData';
import { dbFrom } from '@/integrations/datasource/db';

export const useAgentsQuery = (agentId?: string | null) =>
  useQuery({
    queryKey: ['dashboard-agents', agentId],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, name, is_active, role')
        .or('role.eq.agent,role.eq.supervisor');
      if (agentId) query = query.eq('id', agentId);
      const { data, error } = await query;
      if (error) throw error;
      return {
        agents: data || [],
        onlineAgents: data?.filter(a => a.is_active).length || 0,
        totalAgents: data?.length || 0,
      };
    },
    refetchInterval: 30000,
  });

export const useContactsQuery = (filters: DashboardFilters) =>
  useQuery({
    queryKey: ['dashboard-contacts', filters.queueId, filters.agentId, filters.dateRange?.from?.toISOString(), filters.dateRange?.to?.toISOString()],
    queryFn: async () => {
      let query = dbFrom('contacts')
        .select('id, name, phone, avatar_url, queue_id, assigned_to, created_at, updated_at', { count: 'exact' })
        .order('updated_at', { ascending: false });
      if (filters.queueId) query = query.eq('queue_id', filters.queueId);
      if (filters.agentId) query = query.eq('assigned_to', filters.agentId);
      if (filters.dateRange?.from) query = query.gte('updated_at', filters.dateRange.from.toISOString());
      if (filters.dateRange?.to) query = query.lte('updated_at', filters.dateRange.to.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

export const useMessagesQuery = (filters: DashboardFilters) =>
  useQuery({
    queryKey: ['dashboard-messages', filters.dateRange?.from?.toISOString(), filters.dateRange?.to?.toISOString(), filters.agentId],
    queryFn: async () => {
      let query = dbFrom('messages')
        .select(`id, contact_id, content, sender, created_at, is_read, agent_id, contacts (id, name, phone, avatar_url, queue_id)`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(100);
      if (filters.dateRange?.from) query = query.gte('created_at', filters.dateRange.from.toISOString());
      if (filters.dateRange?.to) query = query.lte('created_at', filters.dateRange.to.toISOString());
      if (filters.agentId) query = query.eq('agent_id', filters.agentId);
      const { data, error } = await query;
      if (error) throw error;
      if (filters.queueId && data) {
        return data.filter((msg) => {
          const contacts = (msg as { contacts?: { queue_id?: string } | null }).contacts;
          return contacts?.queue_id === filters.queueId;
        });
      }
      return data || [];
    },
    refetchInterval: 10000,
  });

export const useQueuesQuery = () =>
  useQuery({
    queryKey: ['dashboard-queues'],
    queryFn: async () => {
      const { data, error } = await safeClient.from<{
        id: string; name: string; color: string;
        queue_members: { profile_id: string; is_active: boolean; profiles: { id: string; is_active: boolean } | null }[];
      }>('queues', q =>
        q.select(`id, name, color, queue_members (profile_id, is_active, profiles (id, is_active))`)
          .eq('is_active', true)
      );
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

export const useContactsPerQueueQuery = () =>
  useQuery({
    queryKey: ['dashboard-contacts-per-queue'],
    queryFn: async () => {
      const { data, error } = await dbFrom('contacts')
        .select('id, queue_id, assigned_to', { count: 'exact' });
      if (error) throw error;
      const queueCounts: Record<string, number> = {};
      data?.forEach(contact => {
        if (contact.queue_id && !contact.assigned_to) {
          queueCounts[contact.queue_id] = (queueCounts[contact.queue_id] || 0) + 1;
        }
      });
      return queueCounts;
    },
    refetchInterval: 15000,
  });

export const useSlaQuery = () =>
  useQuery({
    queryKey: ['dashboard-sla'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_sla')
        .select('first_message_at, first_response_at')
        .not('first_response_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) return { avgResponseTime: null };
      const responseTimes = data.map(sla => {
        const messageTime = new Date(sla.first_message_at).getTime();
        const responseTime = new Date(sla.first_response_at!).getTime();
        return (responseTime - messageTime) / 1000;
      });
      return { avgResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) };
    },
    refetchInterval: 60000,
  });
