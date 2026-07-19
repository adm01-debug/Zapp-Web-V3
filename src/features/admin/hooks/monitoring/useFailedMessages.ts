import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { useUserRole } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { isRlsDeniedError, formatAdminError } from '@/lib/errors/rlsError';
import { classifyRootCause } from '@/lib/failureRootCause';
import { computeFailedMessagesAggregates } from './failedMessagesAggregates';

export type {
  FailedMessageStatus,
  FailedMessageRow,
  FailedMessagesFilters,
  ErrorCodeAggregate,
  InstanceAggregate,
  RootCauseAggregate,
  FailedMessagesAggregates,
  DlqStats,
} from './failedMessagesTypes';

import type { FailedMessageRow, FailedMessagesFilters, DlqStats } from './failedMessagesTypes';

const log = getLogger('useFailedMessages');

type _SupaRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>;
};
// Typed escape hatch for DLQ RPCs not yet reflected in the generated Supabase types.
const _rpc = <T = unknown>(fn: string, args?: Record<string, unknown>) =>
  (supabase as unknown as _SupaRpc).rpc(fn, args) as Promise<{ data: T; error: Error | null }>; // ignore-audit — DLQ RPCs not yet in generated Supabase types

const ADMIN_ONLY_MSG = 'Ação restrita a administradores.';

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

  // Cursor-based pagination: track cursor for each page number to enable efficient navigation
  // Page 0 always has cursor=null; subsequent pages use last row ID from previous page
  const [pageIndexToCursor, setPageIndexToCursor] = useState<Map<number, string | null>>(
    new Map([[0, null]])
  );

  const currentPageCursor = pageIndexToCursor.get(page) ?? null;

  const queryKey = [
    'failed-messages',
    { status, instance, errorCode, rootCause, search, effectiveFrom, effectiveTo, page, pageSize },
  ];

  const query = useQuery<{ rows: FailedMessageRow[]; total: number; deniedReason: string | null }>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_list_failed_messages_cursor', {
        p_status: status ? [status] : null,
        p_instance: instance,
        p_search: search,
        p_from: effectiveFrom,
        p_to: effectiveTo,
        p_limit: pageSize,
        p_cursor_id: currentPageCursor,
      });
      if (error) {
        if (isRlsDeniedError(error)) {
          return { rows: [], total: 0, deniedReason: formatAdminError(error, 'a DLQ') };
        }
        throw error;
      }
      const list = data ?? [];
      const filtered = list.filter((r: Record<string, unknown>) => {
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

  // Update page history with cursor for next page when current page loads
  useEffect(() => {
    if (query.data?.rows && query.data.rows.length > 0) {
      const lastRow = query.data.rows[query.data.rows.length - 1];
      const nextPageCursor = lastRow.id;
      setPageIndexToCursor((prev) => {
        const updated = new Map(prev);
        updated.set(page + 1, nextPageCursor);
        return updated;
      });
    }
  }, [query.data?.rows, page]);

  const aggregates = useMemo(
    () => computeFailedMessagesAggregates(query.data?.rows ?? []),
    [query.data]
  );

  // Reset page history when filters change (start over from page 0)
  useEffect(() => {
    setPageIndexToCursor(new Map([[0, null]]));
  }, [status, instance, errorCode, rootCause, search, effectiveFrom, effectiveTo]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('failed_messages_realtime')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'failed_messages' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
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
        p_reason: reason,
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
      return data as boolean; // ignore-audit: RPC returns unknown; boolean is the documented return type
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
      return data as boolean; // ignore-audit: RPC returns unknown; boolean is the documented return type
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
      const { data, error } = await _rpc<number>('rpc_dlq_bulk_retry_now', {
        p_ids: ids,
        p_reason: reason || null,
      });
      if (error) throw error;
      const n = (data as number | null) ?? 0;
      if (n > 0) await logItemAction('bulk_retry', ids, reason || undefined);
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
      const affected = (data as number | null) ?? 0; // ignore-audit: RPC returns unknown; number is the documented return type
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
