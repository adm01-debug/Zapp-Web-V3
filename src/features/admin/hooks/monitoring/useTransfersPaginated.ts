/**
 * Hook paginado de transferências para o Admin. Respeita RLS:
 * - admin/supervisor veem todas
 * - agentes veem apenas transferências em que são origem/destino
 *
 * Erros de RLS (42501/403) viram `deniedReason` em PT-BR sem quebrar a lista.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { isRlsDeniedError, formatAdminError } from '@/lib/errors/rlsError';
import { queryKeys } from '@/services/api/queryKeys';

export interface TransferRow {
  id: string;
  source_instance: string | null;
  target_instance: string | null;
  remote_jid: string | null;
  contact_name: string | null;
  status: string;
  priority: number | null;
  transfer_type: string | null;
  category: string | null;
  reason: string | null;
  from_agent_id: string | null;
  to_agent_id: string | null;
  sla_deadline: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
}

/** Transfers Filters interface definition. */
export interface TransfersFilters {
  status?: string | null;
  priority?: number | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}

/** use Transfers Paginated function. */
export function useTransfersPaginated(filters: TransfersFilters = {}) {
  const { status = null, priority = null, from = null, to = null, page = 0, pageSize = 50 } = filters;

  // Cursor-based pagination: track cursor for each page
  const [, setPageIndexToCursor] = useState<Map<number, string | null>>(new Map([[0, null]]));

  const query = useQuery<{ rows: TransferRow[]; total: number; deniedReason: string | null }>({
    queryKey: queryKeys.adminOps.transfersPaginated({ status, priority, from, to, page, pageSize }),
    queryFn: async () => {
      const { data, error } = await safeClient.rpc<Array<TransferRow & { total_count?: number | string }>>(
        'rpc_list_transfers_paginated',
        { p_status: status, p_priority: priority, p_from: from, p_to: to, p_limit: pageSize, p_offset: page * pageSize }
      );
      if (error) {
        if (isRlsDeniedError(error)) {
          return { rows: [], total: 0, deniedReason: formatAdminError(error, 'as transferências') };
        }
        throw error;
      }
      const list = (data ?? []) as Array<TransferRow & { total_count?: number | string }>;
      const total = list[0]?.total_count != null ? Number(list[0].total_count) : 0;
      const rows: TransferRow[] = list.map(({ total_count: _t, ...rest }) => rest);
      return { rows, total, deniedReason: null };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: (count, err) => !isRlsDeniedError(err) && count < 2,
  });

  // Update page history with cursor for next page when current page loads
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

  // Reset page history when filters change
  useEffect(() => {
    setPageIndexToCursor(new Map([[0, null]]));
  }, [status, priority, from, to]);

  return query;
}
