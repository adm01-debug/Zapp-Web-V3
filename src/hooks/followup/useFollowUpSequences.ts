/**
 * useFollowUpSequences — Wave 3 tier-2 (2026-07-06)
 * Camada de dados extraída de FollowUpSequences. createMutation recebe
 * (name, steps) como args; resets de formulário via onSuccess no call-site.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';

export interface Step {
  id?: string;
  step_order: number;
  delay_hours: number;
  message_template: string;
  is_active: boolean;
}

export function useFollowUpSequences() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ['followup-sequences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('followup_sequences')
        .select('*, followup_steps(*)') 
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, steps }: { name: string; steps: Step[] }) => {
      const { data: seq, error: seqError } = await supabase
        .from('followup_sequences')
        .insert({ name, created_by: profile?.id })
        .select()
        .single();
      if (seqError) throw seqError;

      const stepsToInsert = steps.map(s => ({
        sequence_id: seq.id,
        step_order: s.step_order,
        delay_hours: s.delay_hours,
        message_template: s.message_template,
        is_active: s.is_active,
      }));

      const { error: stepsError } = await supabase.from('followup_steps').insert(stepsToInsert);
      if (stepsError) throw stepsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-sequences'] });
      toast({ title: 'Sequência criada!', description: 'Follow-up automático configurado.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('followup_sequences').update({ is_active: isActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['followup-sequences'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('followup_sequences').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-sequences'] });
      toast({ title: 'Sequência removida!' });
    },
  });

  return { sequences, isLoading, createMutation, toggleMutation, deleteMutation };
}
