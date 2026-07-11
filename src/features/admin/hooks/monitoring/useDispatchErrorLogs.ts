import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

export interface DispatchErrorLogFilters {
  hours?: number;
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
 * `rpc_list_dispatch_error_logs`. Distinct from `useFailedMessages`, which
 * reflects the live DLQ state — this hook surfaces the immutable history
 * (including failures already retried/abandoned) for forensic analysis.
 */
export function useDispatchErrorLogs(filters: DispatchErrorLogFilters = {}) {
  const {
    hours = 24,
    instance = null,
    agent = null,
    errorCode = null,
    search = null,
    page = 0,
    pageSize = 50,
  } = filters;

  const fromIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  return useQuery<{ rows: DispatchErrorLogRow[]; total: number }>({
    queryKey: [
      'dispatch-error-logs',
      { hours, instance, agent, errorCode, search, page, pageSize },
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_list_dispatch_error_logs', {
        p_from: fromIso,
        p_instance: instance,
        p_agent: agent,
        p_error_code: errorCode,
        p_search: search,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const list = (data ?? []) as any[];
      const total = list[0]?.total_count != null ? Number(list[0].total_count) : 0;
      const rows: DispatchErrorLogRow[] = list.map(
        ({ total_count: _t, ...rest }) => rest as DispatchErrorLogRow
      );
      return { rows, total };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
