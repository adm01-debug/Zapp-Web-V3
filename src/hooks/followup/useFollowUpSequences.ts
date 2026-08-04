import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';

/** Hook: Step. */
export interface Step {
  step_order: number;
  delay_hours: number;
  message_template: string;
  is_active: boolean;
}

interface FollowUpStep {
  id: string;
  step_order: number;
  delay_hours: number;
}

interface FollowUpSequence {
  id: string;
  name: string;
  is_active: boolean;
  trigger_event: string;
  followup_steps: FollowUpStep[];
}

/**
 * Hook: use Follow Up Sequences.
 *
 * NOTA (AUTOMACOES-09): o CRUD abaixo é íntegro e persiste em
 * zapp.followup_sequences / zapp.followup_steps (views públicas com RLS ok).
 * PORÉM o motor de envio NÃO é rastreável a partir deste repo:
 *  - cron `process_pending_followups` (a cada 5 min) + fn `fn_process_pending_followups`
 *    existem no DB de produção mas não têm fonte em supabase/migrations;
 *  - o edge `evolution-followup` processa apenas evo.evolution_followups
 *    (populado pelo Evolution API), sem ponte evidenciada
 *    zapp.followup_sequences → evo.evolution_followups;
 *  - zapp.followup_executions fica sem produtor → histórico sempre vazio.
 * Sinalizado ao maestro: criar edge/SQL-fn com fonte no repo + ponte de sync.
 */
export function useFollowUpSequences() {
  const queryClient = useQueryClient();

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: queryKeys.followupSequences.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('followup_sequences')
        .select('id, name, is_active, trigger_event, followup_steps(id, step_order, delay_hours)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FollowUpSequence[];
    },
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, steps }: { name: string; steps: Step[] }) => {
      const { data: seq, error: seqErr } = await supabase
        .from('followup_sequences')
        .insert({ name, trigger_event: 'conversation_closed', is_active: true })
        .select('id')
        .single();
      if (seqErr || !seq) throw seqErr ?? new Error('Failed to create sequence');

      if (steps.length > 0) {
        const { error: stepsErr } = await safeClient.from('followup_steps', (q) =>
          q.insert(steps.map((s) => ({ ...s, sequence_id: seq.id })))
        );
        if (stepsErr) throw stepsErr;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.executionsRoot() });
      toast({ title: 'Sequência criada' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar sequência', variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('followup_sequences')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.executionsRoot() });
    },
    onError: () => {
      toast({ title: 'Erro ao alterar status', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('followup_sequences').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.executionsRoot() });
      toast({ title: 'Sequência excluída' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir sequência', variant: 'destructive' });
    },
  });

  return { sequences, isLoading, createMutation, toggleMutation, deleteMutation };
}
