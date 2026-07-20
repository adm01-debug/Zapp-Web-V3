import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';

const ONBOARDING_KEY = 'onboarding_completed';

function readLocal(userId: string): boolean {
  try { return localStorage.getItem(`${ONBOARDING_KEY}_${userId}`) === 'true'; }
  catch { return false; }
}
function writeLocal(userId: string, value: boolean) {
  try {
    if (value) localStorage.setItem(`${ONBOARDING_KEY}_${userId}`, 'true');
    else localStorage.removeItem(`${ONBOARDING_KEY}_${userId}`);
  } catch { /* storage unavailable */ }
}

/** Tracks user onboarding completion status with localStorage and database persistence. */
export function useOnboarding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['onboarding-status', user?.id] as const;

  const { data: hasCompletedOnboarding = null, isLoading: loading } = useQuery({
    queryKey,
    queryFn: async (): Promise<boolean> => {
      // Fast path: localStorage already confirmed completion
      if (user && readLocal(user.id)) return true;
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('onboarding_completed')
          .eq('user_id', user!.id)
          .maybeSingle();
        if (data?.onboarding_completed) {
          writeLocal(user!.id, true);
          return true;
        }
        return false;
      } catch (error) {
        log.error('Error checking onboarding status:', error);
        return true; // Default to completed on error
      }
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ onboarding_completed: true })
        .eq('user_id', user.id);
      if (error) log.error('[useOnboarding] completeOnboarding DB update failed:', error.message);
      writeLocal(user.id, true);
    } catch (err) {
      log.error('[useOnboarding] completeOnboarding unexpected error:', err);
    }
    queryClient.setQueryData(queryKey, true);
  }, [user, queryClient, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      await supabase
        .from('user_settings')
        .update({ onboarding_completed: false })
        .eq('user_id', user.id);
      writeLocal(user.id, false);
    } catch { /* ignore */ }
    queryClient.setQueryData(queryKey, false);
  }, [user, queryClient, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    hasCompletedOnboarding,
    loading,
    completeOnboarding,
    resetOnboarding,
  };
}
