import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
}

interface UseCronSchedulerReturn {
  jobs: CronJob[];
  loading: boolean;
  toggling: Record<string, boolean>;
  listJobs: () => Promise<void>;
  toggleJob: (jobname: string, active: boolean) => Promise<void>;
}

/**
 * Hook to manage pg_cron jobs via Admin RPCs.
 * RPCs use SECURITY DEFINER so no direct cron schema access is needed.
 */
export function useCronScheduler(): UseCronSchedulerReturn {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const listJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_list_cron_jobs');
      if (error) throw error;
      setJobs((data ?? []) as CronJob[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar jobs';
      toast.error('Falha ao carregar cron jobs', { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleJob = useCallback(async (jobname: string, active: boolean) => {
    setToggling((prev) => ({ ...prev, [jobname]: true }));
    try {
      const { error } = await supabase.rpc('rpc_toggle_cron_job', {
        p_jobname: jobname,
        p_active: active,
      });
      if (error) throw error;

      setJobs((prev) =>
        prev.map((j) => (j.jobname === jobname ? { ...j, active } : j))
      );

      toast.success(active ? 'Job ativado' : 'Job pausado', {
        description: jobname,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Falha ao alterar status do job', { description: msg });
    } finally {
      setToggling((prev) => {
        const next = { ...prev };
        delete next[jobname];
        return next;
      });
    }
  }, []);

  return { jobs, loading, toggling, listJobs, toggleJob };
}
