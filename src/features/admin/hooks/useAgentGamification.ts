import { queryKeys } from '@/services/api/queryKeys';
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

// Schema drift: profiles/agent_stats/agent_achievements columns nem sempre
// existem nos tipos gerados do schema zapp. Usamos casts controlados via
// helpers unwrapRow/unwrapRows para narrar SelectQueryError sem `any` no domínio.
const db = supabase as unknown as {
  from: (t: string) => {
    select: (s: string) => {
      eq: (c: string, v: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        order: (
          c: string,
          o: { ascending: boolean }
        ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
};

/** Hook: use Agent Gamification. */
export const useAgentGamification = () => {
  const { user } = useAuth();

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile.byId(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await db
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error as Error;
      return unwrapRow<{ id: string }>(data);
    },
    enabled: !!user?.id,
  });

  const profileId = profileQuery.data?.id;

  const statsQuery = useQuery({
    queryKey: queryKeys.agentGamification.stats(profileId),
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await db
        .from('agent_stats')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) throw error as Error;
      return unwrapRow<AgentStats>(data);
    },
    enabled: !!profileId,
    refetchInterval: 30000,
  });

  const achievementsQuery = useQuery({
    queryKey: queryKeys.agentGamification.achievements(profileId),
    queryFn: async () => {
      if (!profileId) return [] as Achievement[];
      const { data, error } = await db
        .from('agent_achievements')
        .select('*')
        .eq('profile_id', profileId)
        .order('earned_at', { ascending: false })
        .limit(20);
      if (error) throw error as Error;
      return unwrapRows<Achievement>(data);
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
