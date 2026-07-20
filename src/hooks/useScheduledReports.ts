import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth';

export function useScheduledReports() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: queryKeys.scheduledReports.configs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_report_configs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createConfig = useMutation({
    mutationFn: async ({
      name,
      reportType,
      frequency,
      recipients,
    }: {
      name: string;
      reportType: string;
      frequency: string;
      recipients: string[];
    }) => {
      const { error } = await supabase.from('scheduled_report_configs').insert({
        name,
        report_type: reportType,
        frequency,
        recipients,
        created_by: profile?.id,
        is_active: true,
        config: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports.configs() });
      toast.success('Relatório agendado criado!');
    },
    onError: () => toast.error('Erro ao criar relatório'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('scheduled_report_configs')
        .update({ is_active: !isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports.configs() });
      toast.success('Status atualizado');
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_report_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports.configs() });
      toast.success('Relatório removido');
    },
    onError: () => toast.error('Erro ao remover relatório'),
  });

  return { configs, isLoading, createConfig, toggleActive, deleteConfig };
}
