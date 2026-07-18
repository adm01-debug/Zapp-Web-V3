import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGoalNotifications');

const CHECK_INTERVAL_MS = 300000; // 5 minutes

export function useGoalNotifications() {
  const { user } = useAuth();

  const checkGoalProgress = useCallback(async () => {
    if (!user) return;

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError || !profile) return;

      const { data: goals } = await supabase
        .from('goals')
        .select('*')
        .or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);

      if (!goals || goals.length === 0) return;
    } catch (err) {
      log.error('Error checking goal progress:', err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    checkGoalProgress();

    const interval = setInterval(checkGoalProgress, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, checkGoalProgress]);

  return { checkGoalProgress };
}
