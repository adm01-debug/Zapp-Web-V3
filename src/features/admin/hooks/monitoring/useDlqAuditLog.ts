import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/features/auth';

/**
 * Histórico de auditoria das operações da DLQ (Dead-Letter Queue).
 *
 * Lê de `zapp.audit_logs` (entity_type='failed_messages') via
 * `rpc_dlq_list_audit`, que faz JOIN com `profiles` para trazer o nome/email
 * de quem executou. Acesso restrito a admin (RPC valida via `has_role`).
 */

export type DlqAuditAction =
  | 'dlq_reprocess_trigger'
  | 'dlq_reprocess_result'
  | 'dlq_retry_now'
  | 'dlq_abandon'
  | 'dlq_bulk_retry'
  | 'dlq_bulk_abandon';

export interface DlqAuditEntry {
  id: string;
  action: DlqAuditAction | string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
}

export interface UseDlqAuditLogOptions {
  limit?: number;
  action?: DlqAuditAction | 'all' | null;
  enabled?: boolean;
  page?: number;
}

export function useDlqAuditLog(opts: UseDlqAuditLogOptions = {}) {
  const { limit = 30, action = null, enabled = true, page = 0 } = opts;
  const { isDev } = useUserRole();

  const [currentPage, setCurrentPage] = useState(page);

  const query = useQuery<DlqAuditEntry[]>({
    queryKey: queryKeys.adminOps.dlqAuditLogFiltered({ limit, action, page: currentPage }),
    enabled: enabled && isDev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_dlq_list_audit', {
        p_limit: limit,
        p_action: action,
        p_offset: currentPage * limit,
      });
      if (error) throw error;
      return (data ?? []) as unknown as DlqAuditEntry[];
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  return { ...query, currentPage, setCurrentPage };
}
