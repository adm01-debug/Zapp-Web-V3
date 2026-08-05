import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/schema';

/** A single queue routing rule row. */
export type QueueRoutingRule = Tables<'queue_routing_rules'>;

/** Insert payload for queue routing rules (queue_id injected by hook). */
export type QueueRoutingRuleInsert = Omit<TablesInsert<'queue_routing_rules'>, 'queue_id'>;

/** Update payload for queue routing rules. */
export type QueueRoutingRuleUpdate = TablesUpdate<'queue_routing_rules'>;

const ruleKey = (queueId: string) => ['queues', 'routing-rules', queueId] as const;

/**
 * CRUD hook for `zapp.queue_routing_rules` scoped to a single queue.
 *
 * Fetches rules ordered by priority (ascending). Mutations toast on
 * success/error and invalidate the list query automatically.
 */
export function useQueueRoutingRules(queueId: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ruleKey(queueId) });

  const query = useQuery<QueueRoutingRule[]>({
    queryKey: ruleKey(queueId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queue_routing_rules')
        .select('*')
        .eq('queue_id', queueId)
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as QueueRoutingRule[];
    },
    enabled: !!queueId,
    staleTime: 30_000,
  });

  const createRule = useMutation({
    mutationFn: async (payload: QueueRoutingRuleInsert) => {
      const { error } = await supabase
        .from('queue_routing_rules')
        .insert({ ...payload, queue_id: queueId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Regra criada com sucesso');
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao criar regra: ${e.message}`),
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: QueueRoutingRuleUpdate }) => {
      const { error } = await supabase
        .from('queue_routing_rules')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Regra atualizada');
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar regra: ${e.message}`),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('queue_routing_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Regra removida');
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao remover regra: ${e.message}`),
  });

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createRule,
    updateRule,
    deleteRule,
  };
}
