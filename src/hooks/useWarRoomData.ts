import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';

const log = getLogger('useWarRoomData');

export interface WarRoomAgent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  activeChats: number;
  maxChats: number;
  avgResponseTime: number;
  resolvedToday: number;
  satisfaction: number;
}

export interface WarRoomQueue {
  id: string;
  name: string;
  color: string | null;
  waiting: number;
  avgWaitTime: number;
  slaBreaches: number;
  slaWarnings: number;
  inProgress: number;
}

export interface WarRoomAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  isNew?: boolean;
}

export function useWarRoomData() {
  const { data: agents = [] } = useQuery({
    queryKey: ['warroom-agents'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, is_active, max_chats')
        .eq('is_active', true);
      if (error) throw error;

      const { data: stats, error: statsErr } = await supabase
        .from('agent_stats')
        .select('profile_id, messages_sent, conversations_resolved, avg_response_time_seconds, customer_satisfaction_score');
      if (statsErr) log.warn('agent_stats fetch failed', statsErr.message);

      const { data: contacts, error: contactsErr } = await dbFrom('contacts')
        .select('assigned_to');
      if (contactsErr) log.warn('contacts fetch failed (warroom agents)', contactsErr.message);

      const contactCounts = (contacts || []).reduce((acc, c) => {
        if (c.assigned_to) acc[c.assigned_to] = (acc[c.assigned_to] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const statsMap = new Map((stats || []).map(s => [s.profile_id, s]));

      return (profiles || []).map((p): WarRoomAgent => {
        const agentStats = statsMap.get(p.id);
        const activeChats = contactCounts[p.id] || 0;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar_url || undefined,
          status: activeChats >= (p.max_chats || 5) ? 'busy' : 'online',
          activeChats,
          maxChats: p.max_chats || 5,
          avgResponseTime: agentStats?.avg_response_time_seconds || 0,
          resolvedToday: agentStats?.conversations_resolved || 0,
          satisfaction: Number(agentStats?.customer_satisfaction_score) || 0,
        };
      });
    },
    refetchInterval: 30000,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['warroom-queues'],
    queryFn: async () => {
      const { data: dbQueues, error: dbQueuesErr } = await supabase
        .from('queues')
        .select('id, name, color, is_active')
        .eq('is_active', true);
      if (dbQueuesErr) throw dbQueuesErr;

      const { data: contacts, error: qContactsErr } = await dbFrom('contacts')
        .select('id, queue_id, assigned_to');
      if (qContactsErr) log.warn('contacts fetch failed (warroom queues)', qContactsErr.message);

      const { data: slaData, error: slaErr } = await supabase
        .from('conversation_sla')
        .select('contact_id, first_response_breached, resolution_breached');
      if (slaErr) log.warn('conversation_sla fetch failed', slaErr.message);

      const breachedContacts = new Set(
        (slaData || []).filter(s => s.first_response_breached || s.resolution_breached).map(s => s.contact_id)
      );

      return (dbQueues || []).map((q): WarRoomQueue => {
        const queueContacts = (contacts || []).filter(c => c.queue_id === q.id);
        const waiting = queueContacts.filter(c => !c.assigned_to).length;
        const inProgress = queueContacts.filter(c => c.assigned_to).length;
        const slaBreaches = queueContacts.filter(c => breachedContacts.has(c.id)).length;
        return {
          id: q.id, name: q.name, color: q.color,
          waiting, avgWaitTime: 0, slaBreaches, slaWarnings: 0, inProgress,
        };
      });
    },
    refetchInterval: 30000,
  });

  return { agents, queues, alerts: [] as WarRoomAlert[] };
}

export function useWarRoomMetrics(agents: WarRoomAgent[], queues: WarRoomQueue[]) {
  return useMemo(() => {
    const totalWaiting = queues.reduce((acc, q) => acc + q.waiting, 0);
    const totalBreaches = queues.reduce((acc, q) => acc + q.slaBreaches, 0);
    const totalWarnings = queues.reduce((acc, q) => acc + q.slaWarnings, 0);
    const onlineAgents = agents.filter(a => a.status === 'online' || a.status === 'busy').length;
    const avgSatisfaction = agents.length > 0 ? agents.reduce((acc, a) => acc + a.satisfaction, 0) / agents.length : 0;
    const totalResolved = agents.reduce((acc, a) => acc + a.resolvedToday, 0);
    return { totalWaiting, totalBreaches, totalWarnings, onlineAgents, avgSatisfaction, totalResolved };
  }, [agents, queues]);
}
