import { useCallback } from 'react';
import { useQueueGoalsManagement } from '@/hooks/useQueueManagement';
import type { QueueGoal } from '@/hooks/useQueueManagement';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('useQueueGoals');

const DEFAULT_GOAL = {
  max_waiting_contacts: 10,
  max_avg_wait_minutes: 5,
  min_assignment_rate: 80,
  max_messages_pending: 50,
  alerts_enabled: true,
};

export type { QueueGoal };

export function useQueueGoals(queueId?: string) {
  const { goals, loading, refetch } = useQueueGoalsManagement(queueId);

  const saveGoal = useCallback(
    async (targetQueueId: string, goal: Partial<QueueGoal>) => {
      const { error } = await safeFrom('queue_goals').upsert(
        { queue_id: targetQueueId, ...goal },
        { onConflict: 'queue_id' }
      );
      if (error) {
        log.error('Failed to save queue goal', targetQueueId, error);
        throw error;
      }
      await refetch();
    },
    [refetch]
  );

  const getDefaultGoal = useCallback(() => ({ ...DEFAULT_GOAL }), []);

  return { loading, goals, saveGoal, getDefaultGoal };
}
