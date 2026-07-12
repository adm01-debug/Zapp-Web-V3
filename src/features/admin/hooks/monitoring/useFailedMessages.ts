// @ts-nocheck
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { useUserRole } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { isRlsDeniedError, formatAdminError } from '@/lib/errors/rlsError';
import {
  classifyRootCause,
  aggregateByRootCause,
  type RootCause,
  type RootCauseMeta,
} from '@/lib/failureRootCause';

const log = getLogger('useFailedMessages');

// Typed escape hatch for DLQ RPCs not yet reflected in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _rpc = <T = unknown>(fn: string, args?: Record<string, unknown>) =>
  (supabase as any).rpc(fn, args) as Promise<{ data: T; error: Error | null }>;

const ADMIN_ONLY_MSG = 'Ação restrita a administradores.';

export type FailedMessageStatus = 'pending' | 'retrying' | 'succeeded' | 'abandoned';

export interface FailedMessageRow {
  id: string;
  instance_name: string;
  remote_jid: string | null;
  payload: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  retry_count: number;
  max_retries: number;
  status: FailedMessageStatus;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  succeeded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FailedMessagesFilters {
  hours?: number;
  status?: FailedMessageStatus | null;
  instance?: string | null;
  errorCode?: string | null;
  /** Filtro adicional por causa raiz canônica (rate_limit, auth, …). */
  rootCause?: RootCause | null;
  search?: string | null;
  /** Custom range — overrides `hours` when both `from` and `to` are set */
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}

export interface ErrorCodeAggregate {
  code: string;
  count: number;
  lastAt: string;
}

export interface InstanceAggregate {
  instance: string;
  count: number;
}

export interface RootCauseAggregate {
  cause: RootCause;
  count: number;
  meta: RootCauseMeta;
}

export interface FailedMessagesAggregates {
  pending: number;
  retrying: number;
  abandoned24h: number;
  successAfterRetryRate: number;
  byErrorCode: ErrorCodeAggregate[];
  byInstance: InstanceAggregate[];
  /** Agrupamento por causa raiz canônica (sorted desc). */
  byRootCause: RootCauseAggregate[];
  topInstance: InstanceAggregate | null;
}

interface _RpcRow extends FailedMessageRow {
  total_count: number | string;
}

export function useFailedMessages(filters: FailedMessagesFilters = {}) {
  const queryClient = useQueryClient();
  const { isDev } = useUserRole();
  const {
    hours = 24,
    status = null,
    instance = null,
    errorCode = null,
    rootCause = null,
    search = null,
    from = null,
    to = null,
    page = 0,
    pageSize = 50,
  } = filters;

  const effectiveFrom = from ?? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const effectiveTo = to;

  const queryKey = [
    'failed-messages',
    { status, instance, errorCode, rootCause, search, effectiveFrom, effectiveTo, page, pageSize },
  ];

  const query = useQuery<{ rows: FailedMessageRow[]; total: number; deniedReason: string | null }>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_list_failed_messages', {
        p_status: status ? [status] : null,
        p_instance: instance,
        p_search: search,
        p_from: effectiveFrom,
        p_to: effectiveTo,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) {
        if (isRlsDeniedError(error)) {
          return { rows: [], total: 0, deniedReason: formatAdminError(error, 'a DLQ') };
        }
        throw error;
      }
      const list = (data ?? []) as _RpcRow[];
      const filtered = list.filter((r) => {
        if (errorCode) {
          const code = r.error_code ?? (r.http_status ? `http_${r.http_status}` : 'unknown');
          if (code !== errorCode) return false;
        }
        if (rootCause) {
          if (classifyRootCause(r) !== rootCause) return false;
        }
        return true;
      });
      const total = list[0]?.total_count != null ? Number(list[0].total_count) : 0;
      const rows: FailedMessageRow[] = filtered.map(
        ({ total_count: _t, ...rest }) => rest as FailedMessageRow
      );
      return { rows, total, deniedReason: null as string | null };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: (count, err) => !isRlsDeniedError(err) && count < 2,
  });

  const aggregates = useMemo<FailedMessagesAggregates>(() => {
    const rows = query.data?.rows ?? [];
    const pending = rows.filter((r) => r.status === 'pending').length;
    const retrying = rows.filter((r) => r.status === 'retrying').length;
    const abandoned24h = rows.filter((r) => r.status === 'abandoned').length;
    const retried = rows.filter((r) => r.retry_count > 0);
    const succeededRetried = retried.filter((r) => r.status === 'succeeded').length;
    const successAfterRetryRate =
      retried.length === 0 ? 0 : Math.round((succeededRetried / retried.length) * 1000) / 10;

    const errorMap = new Map<string, { count: number; lastAt: string }>();
    for (const r of rows) {
      const code = r.error_code ?? (r.http_status ? `http_${r.http_status}` : 'unknown');
      const cur = errorMap.get(code);
      if (cur) {
        cur.count += 1;
        if (r.created_at > cur.lastAt) cur.lastAt = r.created_at;
      } else {
        errorMap.set(code, { count: 1, lastAt: r.created_at });
      }
    }
    const byErrorCode: ErrorCodeAggregate[] = Array.from(errorMap.entries())
      .map(([code, v]) => ({ code, count: v.count, lastAt: v.lastAt }))
      .sort((a, b) => b.count - a.count);

    const instMap = new Map<string, number>();
    for (const r of rows) {
      instMap.set(r.instance_name, (instMap.get(r.instance_name) ?? 0) + 1);
    }
    const byInstance: InstanceAggregate[] = Array.from(instMap.entries())
      .map(([instance, count]) => ({ instance, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const byRootCause: RootCauseAggregate[] = aggregateByRootCause(rows);

    return {
      pending,
      retrying,
      abandoned24h,
      successAfterRetryRate,
      byErrorCode,
      byInstance,
      byRootCause,
      topInstance: byInstance[0] ?? null,
    };
  }, [query.data]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('failed_messages_realtime')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'failed_messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Helper: best-effort audit log for item-level actions. Never blocks.
  const logItemAction = async (
    action: 'retry' | 'abandon' | 'bulk_retry' | 'bulk_abandon',
    ids: string[],
    reason?: string
  ) => {
    try {
      await supabase.rpc('rpc_dlq_log_item_action', {
        p_action: action,
        p_ids: ids,
        p_reason: reason ?? null,
      });
      queryClient.invalidateQueries({ queryKey: ['dlq-audit-log'] });
    } catch (logErr) {
      log.warn('Failed to log DLQ item action', {
        action,
        error: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }
  };

  const retryNow = useMutation({
    mutationFn: async (id: string) => {
      if (!isDev) throw new Error(ADMIN_ONLY_MSG);
      const { data, error } = await supabase.rpc('rpc_dlq_retry_now', { p_id: id });
      if (error) throw error;
      if (data === true) await logItemAction('retry', [id]);
      return data as boolean;
    },
    onSuccess: (ok) => {
      if (ok) toast.success('Item marcado para reprocesso imediato.');
      else toast.info('Nenhuma alteração — item já estava em outro estado.');
      queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
    },
    onError: (e: unknown) => {
      toast.error(`Falha: ${e instanceof Error ? e.message : 'erro'}`);
    },
  });

  const abandon = useMutation({
    mutationFn: async (input: string | { id: string; reason?: string }) => {
      if (!isDev) throw new Error(ADMIN_ONLY_MSG);
      const id = typeof input === 'string' ? input : input.id;
      const reason = typeof input === 'string' ? '' : (input.reason ?? '');
      const { data, error } = await supabase.rpc('rpc_dlq_abandon', { p_id: id, p_reason: reason });
      if (error) throw error;
      if (data === true) await logItemAction('abandon', [id], reason);
      return data as boolean;
    },
    onSuccess: (ok) => {
      if (ok) toast.success('Item abandonado.');
      else toast.info('Item já estava abandonado.');
      queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
    },
    onError: (e: unknown) => {
      toast.error(`Falha: ${e instanceof Error ? e.message : 'erro'}`);
    },
  });

  const bulkRetry = useMutation({
    mutationFn: async (input: string[] | { ids: string[]; reason?: string }) => {
      if (!isDev) throw new Error(ADMIN_ONLY_MSG);
      const ids = Array.isArray(input) ? input : input.ids;
      const reason = Array.isArray(input) ? '' : (input.reason ?? '');
      if (ids.length === 0) return 0;
      let n = 0;
      const succeededIds: string[] = [];
      for (const id of ids) {
        const { data, error } = await supabase.rpc('rpc_dlq_retry_now', { p_id: id });
        if (error) throw error;
        if (data === true) {
          n += 1;
          succeededIds.push(id);
        }
      }
      if (succeededIds.length > 0)
        await logItemAction('bulk_retry', succeededIds, reason || undefined);
      return n;
    },
    onSuccess: (n) => {
      toast.success(`${n} item(s) marcado(s) para reprocesso.`);
      queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
    },
    onError: (e: unknown) => {
      toast.error(`Falha em massa: ${e instanceof Error ? e.message : 'erro'}`);
    },
  });

  const bulkAbandon = useMutation({
    mutationFn: async (input: string[] | { ids: string[]; reason?: string }) => {
      if (!isDev) throw new Error(ADMIN_ONLY_MSG);
      const ids = Array.isArray(input) ? input : input.ids;
      const reason = Array.isArray(input) ? '' : (input.reason ?? '');
      if (ids.length === 0) return 0;
      const { data, error } = await supabase.rpc('rpc_dlq_bulk_abandon', {
        p_ids: ids,
        p_reason: reason,
      });
      if (error) throw error;
      const affected = (data as number | null) ?? 0;
      if (affected > 0) await logItemAction('bulk_abandon', ids, reason);
      return affected;
    },
    onSuccess: (n) => {
      toast.success(`${n} item(s) abandonado(s).`);
      queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
    },
    onError: (e: unknown) => {
      toast.error(`Falha em massa: ${e instanceof Error ? e.message : 'erro'}`);
    },
  });

  const triggerReprocess = useMutation({
    mutationFn: async () => {
      try {
        await _rpc('rpc_dlq_log_reprocess_trigger', { p_source: 'panel' });
      } catch (logErr) {
        log.warn('Failed to log reprocess trigger', {
          error: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }
      const { data, error } = await supabase.functions.invoke('reprocess-failed-messages', {
        method: 'POST',
      });
      if (error) throw error;
      return data as {
        processed?: number;
        succeeded?: number;
        failed?: number;
        abandoned?: number;
        message?: string;
      };
    },
    onSuccess: async (data) => {
      const processed = data?.processed ?? 0;
      try {
        await _rpc('rpc_dlq_log_reprocess_result', {
          p_processed: processed,
          p_succeeded: data?.succeeded ?? 0,
          p_failed: data?.failed ?? 0,
          p_abandoned: data?.abandoned ?? 0,
          p_message: data?.message ?? null,
          p_source: 'panel',
        });
        queryClient.invalidateQueries({ queryKey: ['dlq-audit-log'] });
      } catch (logErr) {
        log.warn('Failed to log reprocess result', {
          error: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }
      toast.success(
        processed === 0
          ? (data?.message ?? 'Nenhum item pendente.')
          : `Reprocessamento concluído — ${processed} item(s): ✓${data.succeeded ?? 0} ✗${data.failed ?? 0} ⚠${data.abandoned ?? 0}`
      );
      queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
    },
    onError: (e: unknown) => {
      toast.error(`Falha ao reprocessar: ${e instanceof Error ? e.message : 'erro'}`);
    },
  });

  return {
    ...query,
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    deniedReason: query.data?.deniedReason ?? null,
    aggregates,
    retryNow,
    abandon,
    bulkRetry,
    bulkAbandon,
    triggerReprocess,
  };
}

/**
 * DLQ aggregate stats (header KPIs) via rpc_dlq_stats. Polls every 30s.
 */
export interface DlqStats {
  total: number;
  total_24h: number;
  oldest_pending_at: string | null;
  by_status: Record<string, number>;
  by_instance: Array<{ instance: string; count: number }>;
}

export function useFailedMessagesStats() {
  return useQuery<DlqStats>({
    queryKey: ['failed-messages-stats'],
    queryFn: async () => {
      const { data, error } = await _rpc<DlqStats>('rpc_dlq_stats');
      if (error) throw error;
      return (data ?? {
        total: 0,
        total_24h: 0,
        oldest_pending_at: null,
        by_status: {},
        by_instance: [],
      }) as DlqStats;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}