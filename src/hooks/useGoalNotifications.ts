import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGoalNotifications');

const CHECK_INTERVAL_MS = 300000; // 5 minutes
const NOTIFY_THRESHOLDS = [50, 75, 100];

interface GoalRow {
  id: string;
  title?: string;
  target_value?: number;
  current_value?: number;
}

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

      const { data: goals, error: goalsError } = await supabase
        .from('queue_goals')
        .select('*')
        .eq('profile_id', profile.id);

      if (goalsError) { log.error('Error fetching goals:', goalsError); return; }
      if (!goals || goals.length === 0) return;

      for (const goal of goals as GoalRow[]) {
        const target = goal.target_value;
        const current = goal.current_value;
        if (!target || target <= 0 || current == null) continue;

        const pct = Math.round((current / target) * 100);
        for (const threshold of NOTIFY_THRESHOLDS) {
          if (pct >= threshold && pct < threshold + Math.round((CHECK_INTERVAL_MS / 60000) * 5)) {
            const label = goal.title ?? `Meta ${goal.id.slice(0, 6)}`;
            toast.info(`${label}: ${pct}% atingido${pct >= 100 ? ' ✓' : ''}`);
            break;
          }
        }
      }
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
