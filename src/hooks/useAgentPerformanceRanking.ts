import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrapRows } from '@/lib/supabase-helpers';

interface AgentStatsRow {
  profile_id: string;
  xp: number;
  level: number;
  current_streak: number;
  best_streak: number;
  messages_sent: number;
  conversations_resolved: number;
  avg_response_time_seconds: number | null;
  customer_satisfaction_score: number | string | null;
}

interface ProfileRow {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

export interface AgentMetric {
  id: string;
  name: string;
  avatar?: string;
  xp: number;
  level: number;
  streak: number;
  bestStreak: number;
  messagessSent: number;
  resolved: number;
  avgResponseTime: number;
  satisfaction: number;
  rank: number;
}

export function useAgentPerformanceRanking() {
  return useQuery({
    queryKey: queryKeys.agentGamification.ranking(),
    queryFn: async () => {
      const { data: statsData } = await supabase
        .from('agent_stats')
        .select(
          'profile_id, xp, level, current_streak, best_streak, messages_sent, conversations_resolved, avg_response_time_seconds, customer_satisfaction_score'
        )
        .order('xp', { ascending: false });

      const stats = unwrapRows<AgentStatsRow>(statsData);
      if (stats.length === 0) return [];

      const profileIds = stats.map((s) => s.profile_id);
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', profileIds as never);

      const profiles = unwrapRows<ProfileRow>(profilesData);
      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      return stats.map((s, i): AgentMetric => {
        const profile = profileMap.get(s.profile_id);
        return {
          id: s.profile_id,
          name: profile?.name || 'Agente',
          avatar: profile?.avatar_url || undefined,
          xp: s.xp,
          level: s.level,
          streak: s.current_streak,
          bestStreak: s.best_streak,
          messagessSent: s.messages_sent,
          resolved: s.conversations_resolved,
          avgResponseTime: s.avg_response_time_seconds || 0,
          satisfaction: Number(s.customer_satisfaction_score) || 0,
          rank: i + 1,
        };
      });
    },
    refetchInterval: 30000,
  });
}
