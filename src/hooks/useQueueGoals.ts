// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useCallback } from 'react';
import { useQueueGoalsManagement } from '@/hooks/useQueueManagement';
import type { QueueGoal } from '@/hooks/useQueueManagement';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('useQueueGoals');

interface QueueGoal {
  id: string;
  queue_id: string;
  max_waiting_contacts: number;
  max_avg_wait_minutes: number;
  min_assignment_rate: number;
  max_messages_pending: number;
  alerts_enabled: boolean;
}

const DEFAULT_GOAL = {
  max_waiting_contacts: 10,
  max_avg_wait_minutes: 5,
  min_assignment_rate: 80,
  max_messages_pending: 50,
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
      const map: Record<string, QueueGoal> = {};
      (data as QueueGoal[]).forEach((g) => { map[g.queue_id] = g; });
      setGoals(map);
    } catch (err) {
      log.error('Failed to fetch queue goals', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();

    const channel = supabase
      .channel('queue-goals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_goals' }, () => {
        fetchGoals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchGoals]);

  const saveGoal = useCallback(async (queueId: string, goal: Partial<QueueGoal>) => {
    const { error } = await supabase
      .from('queue_goals')
      .upsert({ queue_id: queueId, ...goal }, { onConflict: 'queue_id' });
    if (error) {
      log.error('Failed to save queue goal', queueId, error);
      throw error;
    }
  }, []);

  const getDefaultGoal = useCallback(() => ({ ...DEFAULT_GOAL }), []);

  return { loading, goals, saveGoal, getDefaultGoal };
}
