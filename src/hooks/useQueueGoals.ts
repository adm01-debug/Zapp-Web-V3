// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useCallback } from 'react';
import { useQueueGoalsManagement } from '@/hooks/useQueueManagement';
import type { QueueGoal } from '@/hooks/useQueueManagement';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('useQueueGoals');

export interface QueueGoalForm {
  max_waiting_contacts: number;
  max_avg_wait_minutes: number;
  min_assignment_rate: number;
  max_messages_pending: number;
  alerts_enabled: boolean;
}

export interface QueueAlert {
  type: 'waiting_contacts' | 'wait_time' | 'assignment_rate' | 'messages_pending';
  queueId: string;
  queueName: string;
  queueColor?: string | null;
  message: string;
  severity: 'warning' | 'critical';
  currentValue: number;
  threshold: number;
}

export type QueueGoalRecord = QueueGoal & QueueGoalForm;
export type { QueueGoal };

const DEFAULT_GOAL: QueueGoalForm = {
  max_waiting_contacts: 10,
  max_avg_wait_minutes: 15,
  min_assignment_rate: 80,
  max_messages_pending: 30,
  alerts_enabled: true,
};

export function useQueueGoals(queueId?: string) {
  const base = useQueueGoalsManagement(queueId);
  const goals = base.goals.reduce<Record<string, QueueGoalRecord>>((acc, goal) => {
    acc[goal.queue_id] = { ...DEFAULT_GOAL, ...goal } as QueueGoalRecord;
    return acc;
  }, {});

  const getDefaultGoal = useCallback((): QueueGoalForm => ({ ...DEFAULT_GOAL }), []);

  const saveGoal = async (targetQueueId: string, formData: QueueGoalForm): Promise<void> => {
    try {
      const existing = goals[targetQueueId];
      const payload = {
        queue_id: targetQueueId,
        metric: 'queue_health',
        target_value: formData.max_waiting_contacts,
        current_value: 0,
        period: 'daily' as const,
        status: 'on_track' as const,
        ...formData,
      };
      const query = existing
        ? safeFrom('queue_goals').update(payload).eq('id', existing.id)
        : safeFrom('queue_goals').insert(payload);
      const { error } = await query;
      if (error) throw error;
      await base.refetch();
    } catch (err) {
      log.error('Failed to save queue goal', err);
      throw err;
    }
  };

  return { ...base, goals, getDefaultGoal, saveGoal };
}
