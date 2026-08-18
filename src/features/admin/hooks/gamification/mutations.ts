import { queryKeys } from '@/services/api/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AgentStats } from './types';

/** Hook: use Gamification Mutations. */
export function useGamificationMutations(
  profileId: string | undefined,
  currentStats: AgentStats | null | undefined
) {
  const queryClient = useQueryClient();

  const invalidateGamificationCaches = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.agentGamification.stats(profileId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agentGamification.withStats() });
    queryClient.invalidateQueries({ queryKey: queryKeys.agentGamification.ranking() });
  };

  const addXpMutation = useMutation({
    mutationFn: async ({ xp, reason }: { xp: number; reason: string }) => {
      if (!profileId) throw new Error('No profile ID');
      // E70: XP transacional — RPC SECURITY DEFINER grava ledger + estado
      // atomicamente (fim da race condition client-side). Nível recalculado
      // no banco (FLOOR(SQRT(xp/50))+1, espelho de levelUtils).
      const { data, error } = await supabase.rpc('rpc_grant_xp', {
        p_profile_id: profileId,
        p_amount: xp,
        p_reason: reason,
      });
      if (error) throw error;
      const r = data as {
        new_xp: number;
        new_level: number;
        leveled_up: boolean;
        previous_level: number;
      };
      return {
        newXp: r.new_xp,
        newLevel: r.new_level,
        leveledUp: r.leveled_up,
        previousLevel: r.previous_level,
      // E59 — escrita TRANSACIONAL: o banco soma o delta (xp = xp + $1, FOR
      // UPDATE) e recalcula o nível (trigger update_level_on_xp_change).
      // NUNCA computar newXp a partir do cache (race read-modify-write:
      // 2 eventos simultâneos perdiam 1 incremento).
      const { data, error } = await supabase.rpc('rpc_add_xp', {
        p_profile_id: profileId,
        p_xp_delta: xp,
        p_reason: reason,
      });
      if (error) throw error;
      if (!data) throw new Error('rpc_add_xp: resposta vazia');
      return {
        newXp: data.xp,
        newLevel: data.level,
        leveledUp: data.leveled_up,
        previousLevel: data.previous_level,
      };
    },
    onSuccess: () => invalidateGamificationCaches(),
  });

  const grantAchievementMutation = useMutation({
    mutationFn: async ({
      type,
      name,
      description,
      xpReward,
    }: {
      type: string;
      name: string;
      description?: string;
      xpReward: number;
    }) => {
      if (!profileId) throw new Error('No profile ID');

      // E70: dedupe transacional no banco (ON CONFLICT DO NOTHING sobre o
      // índice único da E66) — achievement desbloqueia 1x, sem TOCTOU.
      const { data, error } = await supabase.rpc('rpc_unlock_achievement', {
      // E59 — dedupe + incremento ATOMICO no banco (ON CONFLICT DO NOTHING via
      // índice único agent_achievements_unique + xp/achievements_count
      // incrementais no mesmo UPDATE). Sem read-then-insert client-side.
      const { data, error } = await supabase.rpc('rpc_grant_achievement', {
        p_profile_id: profileId,
        p_type: type,
        p_name: name,
        p_description: description ?? null,
        p_xp_reward: xpReward,
      });
      if (error) {
        // Defensivo: corrida de unique que escapar do ON CONFLICT (ex.: banco
        // sem a migration aplicada ainda) vira alreadyHad, nunca throw.
        if ((error as { code?: string }).code === '23505') {
          return {
            alreadyHad: true,
            newXp: 0,
            newLevel: currentStats?.level ?? 1,
            leveledUp: false,
            previousLevel: currentStats?.level ?? 1,
          };
        }
        throw error;
      }
      const r = data as {
        already_unlocked: boolean;
        new_xp: number | null;
        new_level: number | null;
        leveled_up: boolean;
        previous_level: number | null;
      };
      return {
        alreadyHad: r.already_unlocked,
        newXp: r.new_xp ?? 0,
        newLevel: r.new_level ?? currentStats?.level ?? 1,
        leveledUp: r.leveled_up,
        previousLevel: r.previous_level ?? currentStats?.level ?? 1,
      if (error) throw error;
      if (!data) throw new Error('rpc_grant_achievement: resposta vazia');

      if (data.already_had) {
        return {
          alreadyHad: true,
          newXp: currentStats?.xp ?? 0,
          newLevel: currentStats?.level ?? 1,
          leveledUp: false,
        };
      }
      return {
        alreadyHad: false,
        newXp: data.xp,
        newLevel: data.level,
        leveledUp: data.leveled_up,
      };
    },
    onSuccess: () => {
      invalidateGamificationCaches();
      queryClient.invalidateQueries({ queryKey: queryKeys.agentGamification.achievements(profileId) });
    },
  });

  const updateStreakMutation = useMutation({
    mutationFn: async (increment: boolean) => {
      if (!profileId) throw new Error('No profile ID');
      let newStreak: number;
      let newBestStreak = currentStats?.best_streak || 0;

      if (increment) {
        newStreak = (currentStats?.current_streak || 0) + 1;
        if (newStreak > newBestStreak) newBestStreak = newStreak;
      } else {
        newStreak = 0;
      }

      const { error } = await supabase
        .from('agent_stats')
        .update({
          current_streak: newStreak,
          best_streak: newBestStreak,
          updated_at: new Date().toISOString(),
        })
        .eq('profile_id', profileId);
      if (error) throw error;
      return { newStreak, newBestStreak };
    },
    onSuccess: () => invalidateGamificationCaches(),
  });

  const incrementMessagesMutation = useMutation({
    mutationFn: async (type: 'sent' | 'received') => {
      if (!profileId) throw new Error('No profile ID');
      const newSent =
        type === 'sent' ? (currentStats?.messages_sent || 0) + 1 : currentStats?.messages_sent || 0;
      const newReceived =
        type === 'received'
          ? (currentStats?.messages_received || 0) + 1
          : currentStats?.messages_received || 0;

      const { error } = await supabase
        .from('agent_stats')
        .update({
          messages_sent: newSent,
          messages_received: newReceived,
          updated_at: new Date().toISOString(),
        })
        .eq('profile_id', profileId);
      if (error) throw error;
      return { newSent, newReceived };
    },
    onSuccess: () => invalidateGamificationCaches(),
  });

  const incrementResolutionsMutation = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('No profile ID');
      const newResolutions = (currentStats?.conversations_resolved || 0) + 1;

      const { error } = await supabase
        .from('agent_stats')
        .update({ conversations_resolved: newResolutions, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId);
      if (error) throw error;
      return { newResolutions };
    },
    onSuccess: () => invalidateGamificationCaches(),
  });

  return {
    addXp: addXpMutation.mutateAsync,
    grantAchievement: grantAchievementMutation.mutateAsync,
    updateStreak: updateStreakMutation.mutateAsync,
    incrementMessages: incrementMessagesMutation.mutateAsync,
    incrementResolutions: incrementResolutionsMutation.mutateAsync,
    isAddingXp: addXpMutation.isPending,
    isGrantingAchievement: grantAchievementMutation.isPending,
  };
}