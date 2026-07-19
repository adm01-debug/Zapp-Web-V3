import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGoalNotifications');

const CHECK_INTERVAL_MS = 300000; // 5 minutes
const NOTIFY_THRESHOLDS = [50, 75, 100];

interface GoalRow {
  id: string;
  queue_id: string;
  metric: string;
  target_value: number;
  current_value: number;
}

/**
 * Polls queue goals every 5 minutes and fires a toast the first time each goal
 * crosses a 50/75/100 % threshold. Transitions are deduplicated in-memory via
 * a per-goal ref so the same threshold never alerts twice per session.
 * Does not depend on useAuth — resolves the session via supabase.auth.getUser().
 */
export function useGoalNotifications() {
  // Track the last threshold notified per goal to avoid repeat toasts on the same band.
  const lastNotifiedRef = useRef<Map<string, number>>(new Map());

  const checkGoalProgress = useCallback(async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return;

    try {
      const { data: goals, error: goalsError } = await supabase
        .from('queue_goals')
        .select('id, queue_id, metric, target_value, current_value');

      if (goalsError) { log.error('Error fetching goals:', goalsError); return; }
      if (!goals || goals.length === 0) return;

      for (const goal of goals as GoalRow[]) {
        const { target_value: target, current_value: current } = goal;
        if (!target || target <= 0 || current == null) continue;

        const pct = Math.round((current / target) * 100);
        const crossed = NOTIFY_THRESHOLDS.filter((t) => pct >= t).at(-1);
        if (crossed == null) continue;

        const prev = lastNotifiedRef.current.get(goal.id) ?? -1;
        if (crossed <= prev) continue;

        lastNotifiedRef.current.set(goal.id, crossed);
        const label = goal.metric ?? goal.id.slice(0, 6);
        toast.info(`${label}: ${pct}% atingido${pct >= 100 ? ' ✓' : ''}`);
      }
    } catch (err) {
      log.error('Error checking goal progress:', err);
    }
  }, []);

  useEffect(() => {
    checkGoalProgress();
    const interval = setInterval(checkGoalProgress, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkGoalProgress]);

  return { checkGoalProgress };
}
