/**
 * useAutoExportJobs — AutoExport (G4): CRUD de jobs de exportação + execução
 * via edge `zapp-auto-export` (gera CSV/JSON → storage privado zapp-exports →
 * signed URL). RLS admin-only na tabela; a UI assume perfil admin/supervisor
 * (a rota /admin/auto-export exige role admin).
 */
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth';

/** Tabela fora do types gerado (auto_export_jobs) — client não tipado (padrão da casa). */
const getDynamicClient = () => supabase as unknown as SupabaseClient;

export interface AutoExportJob {
  id: string;
  name: string | null;
  source_table: string | null;
  format: string | null;
  filters: Record<string, unknown> | null;
  status: string | null;
  file_path: string | null;
  row_count: number | null;
  last_run_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Resposta da edge zapp-auto-export (sucesso). */
export interface AutoExportRunResult {
  ok: boolean;
  empty?: boolean;
  rowCount?: number;
  truncated?: boolean;
  message?: string;
  filePath?: string;
  signedUrl?: string;
  expiresIn?: number;
}

export function useAutoExportJobs() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: queryKeys.autoExport.jobs(),
    queryFn: async () => {
      const { data, error } = await getDynamicClient()
        .from('auto_export_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AutoExportJob[];
    },
  });

  const createJob = useMutation({
    mutationFn: async ({
      name,
      sourceTable,
      format,
      filters,
    }: {
      name: string;
      sourceTable: string;
      format: 'csv' | 'json';
      filters?: Record<string, unknown>;
    }) => {
      const { error } = await getDynamicClient().from('auto_export_jobs').insert({
        name,
        source_table: sourceTable,
        format,
        filters: filters && Object.keys(filters).length > 0 ? filters : {},
        created_by: profile?.id ?? null,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoExport.jobs() });
      toast.success('Job de exportação criado!');
    },
    onError: () => toast.error('Erro ao criar job de exportação'),
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getDynamicClient().from('auto_export_jobs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoExport.jobs() });
      toast.success('Job removido');
    },
    onError: () => toast.error('Erro ao remover job'),
  });

  /**
   * Executa o job (gera arquivo + signed URL) ou renova o link do arquivo
   * existente (action: 'link'). Retorna o resultado da edge para download.
   */
  const runJob = useMutation({
    mutationFn: async ({
      jobId,
      action = 'run',
    }: {
      jobId: string;
      action?: 'run' | 'link';
    }): Promise<AutoExportRunResult> => {
      const { data, error } = await supabase.functions.invoke('zapp-auto-export', {
        body: { jobId, action },
      });
      if (error) {
        const message =
          (error as { context?: { message?: string } }).context?.message ??
          error.message ??
          'Falha ao executar exportação';
        throw new Error(message);
      }
      return (data ?? { ok: true }) as AutoExportRunResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoExport.jobs() });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar exportação');
    },
  });

  return { jobs, isLoading, createJob, deleteJob, runJob };
}
