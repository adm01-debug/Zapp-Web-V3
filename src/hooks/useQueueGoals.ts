import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export function useQueueGoals() {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Record<string, QueueGoal>>({});

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('queue_goals').select('*');
      if (!error && data) {
        const map: Record<string, QueueGoal> = {};
        (data as QueueGoal[]).forEach((g) => { map[g.queue_id] = g; });
        setGoals(map);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();

    const subscription = supabase
      .channel('queue-goals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_goals' }, () => {
        fetchGoals();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchGoals]);

  const saveGoal = useCallback(async (queueId: string, goal: Partial<QueueGoal>) => {
    await supabase.from('queue_goals').upsert({ queue_id: queueId, ...goal });
  }, []);

  const getDefaultGoal = useCallback(() => ({ ...DEFAULT_GOAL }), []);

  return { loading, goals, saveGoal, getDefaultGoal };
}
