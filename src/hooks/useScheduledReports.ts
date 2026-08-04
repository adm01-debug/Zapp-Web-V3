/**
 * DASHBOARD-16 (fio quebrado): o edge `send-scheduled-report` lê/atualiza a tabela
 * `scheduled_reports` (supabase/functions/send-scheduled-report/index.ts — SELECT por
 * reportId + UPDATE last_sent_at/next_send_at). Este hook gravava em
 * `scheduled_report_configs` (tabela DIFERENTE), então relatórios criados pela UI
 * nunca eram encontrados pelo edge. Alinhado: todas as operações agora usam
 * `scheduled_reports` (schema zapp — mesmo cliente padrão do app).
 *
 * Sinalização (fora do escopo desta branch — exige migration):
 * - RLS: só existe policy SELECT (scheduled_reports_select) para authenticated;
 *   INSERT/UPDATE/DELETE dependem de RLS desabilitado ou policy — se as escritas
 *   falharem com RLS violation, criar `scheduled_reports_manage` (INSERT/UPDATE/DELETE
 *   USING created_by = profile do usuário OU admin/supervisor), espelhando o padrão
 *   de scheduled_messages.
 * - O disparo periódico depende de pg_cron invocando a edge (não há cron no repo).
 */
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
        .from('scheduled_reports')
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
      const { error } = await supabase.from('scheduled_reports').insert({
        name,
        report_type: reportType,
        frequency,
        recipients,
        created_by: profile?.id,
        is_active: true,
        format: 'email',
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
        .from('scheduled_reports')
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
      const { error } = await supabase.from('scheduled_reports').delete().eq('id', id);
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
