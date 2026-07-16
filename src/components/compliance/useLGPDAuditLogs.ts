import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useLGPDAuditLogs');

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

export function useLGPDAuditLogs(userId: string | undefined, limit = 50) {
  const [logs, setLogs] = useState<LGPDAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const orFilter = LGPD_ACTION_PREFIXES.map((p) => `action.ilike.${p}%`).join(',');
      const { data, error: qErr } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, details, created_at')
        .eq('user_id', userId)
        .or(orFilter)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (qErr) throw qErr;
      setLogs((data ?? []) as LGPDAuditEntry[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar histórico de auditoria';
      log.error('Failed to fetch LGPD audit logs', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, loading, error, refetch: fetchLogs };
}
