import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { supabase } from '@/integrations/supabase/client';

/** Dispatch Error Log Row interface definition. */
export interface DispatchErrorLogRow {
  id: string;
  failed_message_id: string | null;
  instance_name: string;
  remote_jid: string | null;
  channel_type: string | null;
  agent_email: string | null;
  agent_user_id: string | null;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  retry_count: number;
  payload: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  occurred_at: string;
}

/** Dispatch Error Log Filters interface definition. */
export interface DispatchErrorLogFilters {
  hours?: number;
  to?: string | null;
  instance?: string | null;
  agent?: string | null;
  errorCode?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

interface _RpcRow extends DispatchErrorLogRow {
  total_count: number | string;
}

/**
 * Reads from the append-only `dispatch_error_logs` audit trail via
 * `rpc_list_dispatch_error_logs_cursor`. Distinct from `useFailedMessages`, which
 * reflects the live DLQ state — this hook surfaces the immutable history
 * (including failures already retried/abandoned) for forensic analysis.
 */
export function useDispatchErrorLogs(filters: DispatchErrorLogFilters = {}) {
  const {
    hours = 24,
    to = null,
    instance = null,
    agent = null,
    errorCode = null,
    search = null,
    page = 0,
    pageSize = 50,
  } = filters;

  const fromIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Cursor-based pagination: page 0 always has cursor=null; subsequent pages
  // use the last row ID returned by the previous page.
  const [pageIndexToCursor, setPageIndexToCursor] = useState<Map<number, string | null>>(
    new Map([[0, null]])
  );

  const currentPageCursor = pageIndexToCursor.get(page) ?? null;

  // Reset cursor map whenever filter dimensions change (new result set, start from page 0)
  useEffect(() => {
    setPageIndexToCursor(new Map([[0, null]]));
  }, [hours, to, instance, agent, errorCode, search]);

  const query = useQuery<{ rows: DispatchErrorLogRow[]; total: number }>({
    queryKey: queryKeys.dispatchErrorLogs.filtered({
      hours,
      to,
      instance,
      agent,
      errorCode,
      search,
      page,
      pageSize,
      currentPageCursor,
    }),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_list_dispatch_error_logs_cursor', {
        p_from: fromIso,
        p_to: to,
        p_instance: instance,
        p_agent: agent,
        p_error_code: errorCode,
        p_search: search,
        p_limit: pageSize,
        p_cursor_id: currentPageCursor,
      });
      if (error) throw error;
      const list = (data ?? []) as unknown as _RpcRow[];
      const total = list[0]?.total_count != null ? Number(list[0].total_count) : 0;
      const rows: DispatchErrorLogRow[] = list.map(
        ({ total_count: _t, ...rest }) => rest as DispatchErrorLogRow
      );
      return { rows, total };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Advance cursor map when a page loads successfully
  useEffect(() => {
    if (query.data?.rows && query.data.rows.length > 0) {
      const lastRow = query.data.rows[query.data.rows.length - 1];
      setPageIndexToCursor((prev) => {
        const updated = new Map(prev);
        updated.set(page + 1, lastRow.id);
        return updated;
      });
    }
  }, [query.data?.rows, page]);

  return query;
}
