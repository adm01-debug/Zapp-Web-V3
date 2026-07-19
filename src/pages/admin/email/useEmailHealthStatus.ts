import { useState, useEffect } from 'react';
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

  const loadHealth = async () => {
    setLoading(true);
    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${projectUrl}/functions/v1/email-health?page=${filters.page}&pageSize=5${filters.requestId ? `&requestId=${filters.requestId}` : ''}${filters.resource ? `&resource=${filters.resource}` : ''}${filters.operation ? `&operation=${filters.operation}` : ''}`;

      const fetchResponse = await fetch(functionUrl, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const dataFull = await fetchResponse.json();

      if (!fetchResponse.ok) throw new Error(dataFull.error || 'Erro na Edge Function');

      if (!mountedRef.current) return;
      setHealth({
        status: castStatus(dataFull.status),
        source: typeof dataFull.source === 'string' ? dataFull.source : undefined,
        lastValidation: dataFull.last_validation ? new Date(dataFull.last_validation) : null,
        cacheExpiration: null,
        recentFailures: dataFull.failuresResult?.items || [],
        stats: {
          totalCalls: 0,
          failedCalls: dataFull.failure_count_window || 0,
          cacheHits: 0,
        },
      });
      setFailuresData(dataFull.failuresResult || { items: [], total: 0 });
    } catch (error) {
      log.error('Error loading email health', error);
      toast.error('O serviço de telemetria do Email está indisponível.');

      try {
        const { data: summary, error: summaryError } = await emailApi.getHealthSummary();
        if (summaryError) throw summaryError;

        if (summary) {
          if (!mountedRef.current) return;
          setHealth({
            status: castStatus(summary.status),
            lastValidation: summary.last_validation ? new Date(summary.last_validation) : null,
            cacheExpiration: null,
            recentFailures: [],
            stats: { totalCalls: 0, failedCalls: summary.failure_count_60m || 0, cacheHits: 0 },
          });
        }
      } catch (fallbackErr) {
        log.error('Email health fallback also failed', fallbackErr);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadHealth();

    const channel = supabase
      .channel('email-admin-status')
      .on<EmailHealthSummary>(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'email_health_summary' },
        (payload) => {
          if (payload.new) {
            setHealth((prev) =>
              prev
                ? {
                    ...prev,
                    status: castStatus(payload.new.status),
                    lastValidation: payload.new.last_validation
                      ? new Date(payload.new.last_validation)
                      : prev.lastValidation,
                    stats: {
                      ...prev.stats,
                      failedCalls: payload.new.failure_count_60m || 0,
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
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleRevalidate = async () => {
    const revalidatePromise = async () => {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${projectUrl}/functions/v1/email-health?action=revalidate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await emailHealthService.forceRevalidation();
      return data;
    };

    toast.promise(revalidatePromise(), {
      loading: 'Agendando revalidação no backend...',
      success: 'Revalidação agendada com sucesso!',
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