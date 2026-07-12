import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';

export interface QueueGoal {
  id: string;
  queue_id: string;
  max_waiting_contacts: number;
  max_avg_wait_minutes: number;
  min_assignment_rate: number;
  max_messages_pending: number;
  alerts_enabled: boolean;
}

const DEFAULT_GOAL_VALUES = {
  max_waiting_contacts: 10,
  max_avg_wait_minutes: 15,
  min_assignment_rate: 80,
  max_messages_pending: 50,
  alerts_enabled: true,
} as const;

function normalizeQueueGoal(row: Record<string, unknown>): QueueGoal {
  return {
    id: String(row.id ?? ''),
    queue_id: String(row.queue_id ?? ''),
    max_waiting_contacts: (row.max_waiting_contacts as number | null) ?? DEFAULT_GOAL_VALUES.max_waiting_contacts,
    max_avg_wait_minutes: (row.max_avg_wait_minutes as number | null) ?? DEFAULT_GOAL_VALUES.max_avg_wait_minutes,
    min_assignment_rate: (row.min_assignment_rate as number | null) ?? DEFAULT_GOAL_VALUES.min_assignment_rate,
    max_messages_pending: (row.max_messages_pending as number | null) ?? DEFAULT_GOAL_VALUES.max_messages_pending,
    alerts_enabled: (row.alerts_enabled as boolean | null) ?? DEFAULT_GOAL_VALUES.alerts_enabled,
  };
}

export interface QueueAlert {
  type: 'waiting_contacts' | 'wait_time' | 'assignment_rate' | 'messages_pending';
  queueId: string;
  queueName: string;
  queueColor: string;
  message: string;
  severity: 'warning' | 'critical';
  currentValue: number;
  threshold: number;
}

export function useQueueGoals() {
  const [goals, setGoals] = useState<Record<string, QueueGoal>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    void fetchGoals();

    const channel = supabase
      .channel('queue-goals-changes')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_goals' }, fetchGoals)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('queue_goals')
        .select('*');

      if (error) throw error;

      const goalsMap: Record<string, QueueGoal> = {};
      data?.forEach(goal => {
        goalsMap[goal.queue_id] = goal;
      });

      setGoals(goalsMap);
    } catch (error) {
      log.error('Error fetching queue goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveGoal = async (queueId: string, goalData: Partial<QueueGoal>) => {
    try {
      const existingGoal = goals[queueId];

      if (existingGoal) {
        const { error } = await supabase
          .from('queue_goals')
          .update(goalData)
          .eq('queue_id', queueId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('queue_goals')
          .insert({
            queue_id: queueId,
            ...goalData,
          });

        if (error) throw error;
      }

      toast({
        title: 'Metas salvas',
        description: 'As metas da fila foram atualizadas com sucesso.',
      });

      await fetchGoals();
    } catch (error) {
      log.error('Error saving queue goal:', error);
      toast({
        title: 'Erro ao salvar metas',
        description: 'Não foi possível salvar as metas.',
        variant: 'destructive',
      });
    }
  };

  const getDefaultGoal = (): Omit<QueueGoal, 'id' | 'queue_id'> => ({
    max_waiting_contacts: 10,
    max_avg_wait_minutes: 15,
    min_assignment_rate: 80,
    max_messages_pending: 50,
    alerts_enabled: true,
  });

  return {
    goals,
    loading,
    saveGoal,
    getDefaultGoal,
    refetch: fetchGoals,
  };
}
