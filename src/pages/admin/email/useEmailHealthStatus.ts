import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';
import { useEmail } from '@/hooks/useEmailManagement';
import { emailHealthService } from '@/services/email/emailHealthService';
import type { EmailHealthInfo, EmailFailure } from '@/services/email/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  emailApi,
  type EmailHealthSummary,
  type EmailRevalidationJob,
} from '@/services/email/emailApi';

const log = getLogger('AdminEmailStatusPage');

/** Narrows an arbitrary status string to the `EmailHealthInfo['status']` union, defaulting to `'error'` for unknown values. */
export const castStatus = (status: string | null): EmailHealthInfo['status'] => {
  if (status && ['healthy', 'degraded', 'error'].includes(status)) {
    return status as EmailHealthInfo['status']; // ignore-audit: includes guard above confirms status is a valid union member
  }
  return 'error';
};

interface Filters {
  requestId: string;
  resource: string;
  operation: string;
  page: number;
}

/** Fetches email infrastructure health from the `email-health` edge function, subscribes to realtime changes, and exposes revalidation and action handlers. */
export function useEmailHealthStatus() {
  const { accounts } = useEmail();
  const [health, setHealth] = useState<EmailHealthInfo | null>(null);
  const [_loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    requestId: '',
    resource: '',
    operation: '',
    page: 1,
  });
  const [failuresData, setFailuresData] = useState<{ items: EmailFailure[]; total: number }>({
    items: [],
    total: 0,
  });
  const [isRetrying, setIsRetrying] = useState<Record<string, boolean>>({});

  const mountedRef = useMountedRef();
  const loadAbortRef = useRef<AbortController | null>(null);

  const loadHealth = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        // A edge `email-health` não existe (404 silencioso). O dado real vem do
        // RPC rpc_get_email_health_summary + telemetria local (safeClient).
        const info = await emailHealthService.getHealthStatus();
        if (signal?.aborted || !mountedRef.current) return;
        setHealth(info);
        setFailuresData(emailHealthService.getFailures(filters));
      } catch (error) {
        if ((error instanceof DOMException && error.name === 'AbortError') || signal?.aborted)
          return;
        log.error('Error loading email health', error);
        toast.error('O serviço de telemetria do Email está indisponível.');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [filters, mountedRef]
  );

  useEffect(() => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    void loadHealth(controller.signal);

    const channel = supabase
      .channel('email-admin-status')
      .on<EmailHealthSummary>(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'email_health_summary' },
        (payload) => {
          const next = payload.new as EmailHealthSummary | null;
          if (next && Object.keys(next).length > 0) {
            setHealth((prev) =>
              prev
                ? {
                    ...prev,
                    status: castStatus(next.status),
                    lastValidation: next.last_validation
                      ? new Date(next.last_validation)
                      : prev.lastValidation,
                    stats: {
                      ...prev.stats,
                      failedCalls: next.failure_count_60m || 0,
                    },
                  }
                : null
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'email_revalidation_jobs' },
        (payload) => {
          const job = (payload.new || payload.old) as EmailRevalidationJob;
          if (payload.eventType === 'INSERT') {
            toast.info(`Nova solicitação de revalidação agendada`);
          } else if (payload.eventType === 'UPDATE' && job.status === 'completed') {
            toast.success(`Job ${job.id.split('-')[0]} concluído com sucesso`);
          } else if (payload.eventType === 'UPDATE' && job.status === 'failed') {
            toast.error(`Job ${job.id.split('-')[0]} falhou`);
          }
          void loadHealth();
        }
      )
      .subscribe();

    return () => {
      loadAbortRef.current?.abort();
      void channel.unsubscribe();
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [filters, loadHealth]);

  const handleRevalidate = async () => {
    // A edge `email-health` não existe; a revalidação é local (limpa o cache de
    // telemetria dos recursos críticos). Jobs em email_revalidation_jobs são
    // disparados pelo backend e refletidos pelo realtime abaixo.
    const revalidatePromise = async () => {
      await emailHealthService.forceRevalidation();
      return { success: true };
    };

    toast.promise(revalidatePromise(), {
      loading: 'Limpando cache de telemetria...',
      success: 'Revalidação concluída com sucesso!',
      error: 'Erro ao solicitar revalidação',
    });
  };

  const handleAction = async (action: 'markRead' | 'rpc_test', id: string) => {
    setIsRetrying((prev) => ({ ...prev, [id]: true }));
    try {
      if (action === 'markRead') {
        const { error } = await emailApi.markThreadRead(id, true);
        if (error) throw error;
        toast.success('Thread marcada como lida no servidor.');
      } else if (action === 'rpc_test') {
        const { error } = await emailApi.getTokenStatus();
        if (error) throw error;
        toast.success('RPC de status de token validada com sucesso.');
      }
      await loadHealth();
    } catch (err: unknown) {
      toast.error(
        `Falha na etapa ${action}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`
      );
    } finally {
      setIsRetrying((prev) => ({ ...prev, [id]: false }));
    }
  };

  return {
    accounts,
    health,
    filters,
    setFilters,
    failuresData,
    isRetrying,
    handleRevalidate,
    handleAction,
  };
}
