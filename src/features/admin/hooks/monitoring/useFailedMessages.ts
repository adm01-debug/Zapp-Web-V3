import { queryKeys } from '@/services/api/queryKeys';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/schema';

import { useUserRole } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { isRlsDeniedError, formatAdminError } from '@/lib/errors/rlsError';
import { classifyRootCause } from '@/lib/failureRootCause';
import { computeFailedMessagesAggregates } from './failedMessagesAggregates';
import { parseDlqStats, toRecordOrNull, isFailedMessageStatus } from './monitoringSchemas';

/** Re-exported module members. */
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

// E60: tipos gerados não modelam NULL nos params sem DEFAULT, mas a SQL trata
// `p_status IS NULL OR ...` explicitamente. Widen documentado no boundary.
type _CursorArgs = Database['zapp']['Functions']['rpc_list_failed_messages_cursor']['Args'];
type _CursorArgsNullable = {
  [K in keyof _CursorArgs]: _CursorArgs[K] | null;
};
// Contrato wide: a RPC viva aceita filtros além dos modelados no types gerado
// (p_status/p_instance/p_search/p_from/p_to — espelho do pg_get_functiondef real).
type _CursorArgsWide = _CursorArgsNullable & {
  p_status?: string[] | null;
  p_instance?: string | null;
  p_search?: string | null;
  p_from?: string | null;
  p_to?: string | null;
  p_cursor_id?: string | null;
};

const ADMIN_ONLY_MSG = 'Ação restrita a administradores.';

/** Queries failed Evolution API messages with DLQ stats, retry mutations, and realtime invalidation. */
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

  // Memoize so the ISO string is stable across renders when `from` is null.
  // Without this, the string changes every millisecond → queryKey changes every render
  // → infinite refetch loop (effectiveFrom is in both queryKey and useEffect deps).
  const effectiveFrom = useMemo(
    () => from ?? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    [from, hours]
  );
  const effectiveTo = to;

  // Cursor-based pagination: track cursor for each page number to enable efficient navigation
  // Page 0 always has cursor=null; subsequent pages use last row ID from previous page
  const [pageIndexToCursor, setPageIndexToCursor] = useState<Map<number, string | null>>(
    new Map([[0, null]])
  );

  const currentPageCursor = pageIndexToCursor.get(page) ?? null;

  const queryKey = queryKeys.failedMessages.filtered({
    status,
    instance,
    errorCode,
    rootCause,
    search,
    effectiveFrom,
    effectiveTo,
    page,
    pageSize,
    currentPageCursor,
  });

  const query = useQuery<{ rows: FailedMessageRow[]; total: number; deniedReason: string | null }>({
    queryKey,
    queryFn: async () => {
      // E60: `_CursorArgsNullable` documenta o contrato real da SQL (NULL = sem filtro).
      const args: _CursorArgsWide = {
        p_status: status ? [status] : null,
        p_instance: instance,
        p_search: search,
        p_from: effectiveFrom,
        p_to: effectiveTo,
        p_limit: pageSize,
        p_cursor_id: currentPageCursor,
        p_error_code: errorCode ?? null,
      };
      const { data, error } = await supabase.rpc('rpc_list_failed_messages_cursor', args as _CursorArgs);
      if (error) {
        if (isRlsDeniedError(error)) {
          return { rows: [], total: 0, deniedReason: formatAdminError(error, 'a DLQ') };
        }
        throw error;
      }
      const list = data ?? [];
      // errorCode is now filtered server-side via p_error_code.
      // rootCause classification is a multi-field heuristic — filtered client-side.
      const filtered = list.filter((r) => {
        if (rootCause) {
          if (
            classifyRootCause({
              error_code: r.error_code,
              http_status: r.http_status,
              error_message: r.error_message,
              payload: toRecordOrNull(r.payload),
            }) !== rootCause
          ) {
            return false;
          }
        }
        return true;
      });
      const total =
        rootCause && filtered.length !== list.length
          ? filtered.length
          : list[0]?.total_count != null
            ? Number(list[0].total_count)
            : 0;
      const rows: FailedMessageRow[] = filtered.map((r) => ({
        id: r.id,
        instance_name: r.instance_name ?? '',
        remote_jid: r.remote_jid,
        payload: toRecordOrNull(r.payload) ?? {},
        error_code: r.error_code,
        error_message: r.error_message,
        http_status: r.http_status,
        retry_count: r.retry_count ?? 0,
        max_retries: r.max_retries ?? 3,
        status: r.status && isFailedMessageStatus(r.status) ? r.status : 'failed',
        last_attempt_at: r.last_attempt_at,
        next_attempt_at: r.next_attempt_at,
        succeeded_at: r.succeeded_at,
        created_at: r.created_at ?? '',
        updated_at: r.updated_at ?? '',
      }));
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
      .channel(`failed_messages_realtime:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'failed_messages' }, () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.failedMessages.all() });
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
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
      queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.dlqAuditLog() });
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
      return data;
    },
    onSuccess: (ok) => {
      if (ok) toast.success('Item marcado para reprocesso imediato.');
      else toast.info('Nenhuma alteração — item já estava em outro estado.');
      queryClient.invalidateQueries({ queryKey: queryKeys.failedMessages.all() });
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
      return data;
    },
    onSuccess: (ok) => {
      if (ok) toast.success('Item abandonado.');
      else toast.info('Item já estava abandonado.');
      queryClient.invalidateQueries({ queryKey: queryKeys.failedMessages.all() });
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
      const { data, error } = await supabase.rpc('rpc_dlq_bulk_retry_now', {
        p_ids: ids,
        p_reason: reason || undefined,
      });
      if (error) throw error;
      const n = data ?? 0;
      if (n > 0) await logItemAction('bulk_retry', ids, reason || undefined);
      return n;
    },
    onSuccess: (n) => {
      toast.success(`${n} item(s) marcado(s) para reprocesso.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.failedMessages.all() });
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
      const affected = data ?? 0;
      if (affected > 0) await logItemAction('bulk_abandon', ids, reason);
      return affected;
    },
    onSuccess: (n) => {
      toast.success(`${n} item(s) abandonado(s).`);
      queryClient.invalidateQueries({ queryKey: queryKeys.failedMessages.all() });
    },
    onError: (e: unknown) => {
      toast.error(`Falha em massa: ${e instanceof Error ? e.message : 'erro'}`);
    },
  });

  const triggerReprocess = useMutation({
    mutationFn: async () => {
      try {
        await supabase.rpc('rpc_dlq_log_reprocess_trigger', { p_source: 'panel' });
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
        await supabase.rpc('rpc_dlq_log_reprocess_result', {
          p_processed: processed,
          p_succeeded: data?.succeeded ?? 0,
          p_failed: data?.failed ?? 0,
          p_abandoned: data?.abandoned ?? 0,
          p_message: data?.message ?? undefined,
          p_source: 'panel',
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.dlqAuditLog() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.failedMessages.all() });
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
    queryKey: queryKeys.failedMessages.stats(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_dlq_stats');
      if (error) throw error;
      return parseDlqStats(data);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
