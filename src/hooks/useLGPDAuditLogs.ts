import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useLGPDAuditLogs');

/** L G P D Audit Entry interface definition. */
export interface LGPDAuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Ações de auditoria relacionadas à LGPD/privacidade.
 * Filtra por prefixos conhecidos (gdpr_*, lgpd_*, consent_*, data_*).
 */
const LGPD_ACTION_PREFIXES = ['gdpr_', 'lgpd_', 'consent_', 'data_export', 'data_deletion', 'privacy_'];

/** Fetches LGPD/privacy-related audit log entries for the given user, filtered to known action prefixes. */
export function useLGPDAuditLogs(userId: string | undefined, limit = 50) {
  const { data: logs = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['lgpd-audit-logs', userId, limit] as const,
    queryFn: async () => {
      const orFilter = LGPD_ACTION_PREFIXES.map((p) => `action.ilike.${p}%`).join(',');
      const { data, error: qErr } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, details, created_at')
        .eq('user_id', userId!)
        .or(orFilter)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (qErr) {
        log.error('Failed to fetch LGPD audit logs', qErr);
        throw qErr;
      }
      return (data ?? []) as LGPDAuditEntry[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Erro ao carregar histórico de auditoria') : null;

  return { logs, loading, error, refetch };
}
