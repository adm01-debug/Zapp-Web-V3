import { useQuery } from '@tanstack/react-query';
import { unwrapRow, unwrapRows } from '@/lib/supabase-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { useGamificationMutations } from './gamification/mutations';
import type { AgentStats, Achievement } from './gamification/types';

// Re-export types and utilities for external consumers
export type { AgentStats, Achievement } from './gamification/types';
export { ACHIEVEMENT_TYPES } from './gamification/types';
export { calculateLevel, xpForNextLevel, levelProgress } from './gamification/levelUtils';

export const useAgentGamification = () => {
  const { user } = useAuth();

  const profileQuery = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const profileId = profileQuery.data?.id;

  const statsQuery = useQuery({
    queryKey: ['agent-stats', profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from('agent_stats')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) throw error;
      return data as AgentStats | null; // ignore-audit: narrows Supabase query result to local interface
    },
    enabled: !!profileId,
    refetchInterval: 30000,
  });

  const achievementsQuery = useQuery({
    queryKey: ['agent-achievements', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from('agent_achievements')
        .select('*')
        .eq('profile_id', profileId)
        .order('earned_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Achievement[]; // ignore-audit: narrows Supabase query result to local interface
    },
    enabled: !!profileId,
  });

  const mutations = useGamificationMutations(profileId, statsQuery.data);

  return {
    stats: statsQuery.data,
    achievements: achievementsQuery.data || [],
    isLoading: statsQuery.isLoading || achievementsQuery.isLoading,
    profileId,
    ...mutations,
  };
};