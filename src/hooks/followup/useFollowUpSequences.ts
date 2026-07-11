import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';

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

const QUERY_KEY = ['followup-sequences'];

export function useFollowUpSequences() {
  const queryClient = useQueryClient();

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('followup_sequences')
        .select('id, name, is_active, trigger_event, followup_steps(id, step_order, delay_hours)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpSequence[];
    },
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
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Sequência excluída' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir sequência', variant: 'destructive' });
    },
  });

  return { sequences, isLoading, createMutation, toggleMutation, deleteMutation };
}
