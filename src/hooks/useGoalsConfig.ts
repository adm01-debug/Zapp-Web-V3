import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrapRow, unwrapRows } from '@/lib/supabase-helpers';

export interface GoalConfig {
  id?: string;
  goal_type: string;
  daily_target: number;
  weekly_target: number;
  monthly_target: number;
  is_active: boolean;
}

export function useGoalsConfigProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.userProfile.meById(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return unwrapRow<{ id: string; name: string | null }>(data);
    },
    enabled: !!userId,
  });
}

export function useGoalsConfigData(profileId: string | undefined, open: boolean) {
  return useQuery({
    queryKey: queryKeys.goals.configForProfile(profileId),
    queryFn: async () => {
      if (!profileId) return [] as GoalConfig[];
      const { data, error } = await supabase
        .from('goals_configurations')
        .select('*')
        .eq('profile_id', profileId);
      if (error) throw error;
      return unwrapRows<GoalConfig>(data);
    },
    enabled: !!profileId && open,
  });
}

export function useSaveGoals(
  profileId: string | undefined,
  onSuccess?: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (goalsToSave: GoalConfig[]) => {
      if (!profileId) throw new Error('Profile not found');
      const rows = goalsToSave.map((goal) => ({
        ...(goal.id ? { id: goal.id } : {}),
        profile_id: profileId,
        goal_type: goal.goal_type,
        daily_target: goal.daily_target,
        weekly_target: goal.weekly_target,
        monthly_target: goal.monthly_target,
        is_active: goal.is_active,
      }));
      const { error } = await supabase
        .from('goals_configurations')
        .upsert(rows, { onConflict: 'profile_id,goal_type' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.config() });
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.messagesRoot() });
      onSuccess?.();
    },
  });
}
