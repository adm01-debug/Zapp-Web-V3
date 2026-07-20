import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  details: unknown;
};

const OPS_ENTITY_TYPES = [
  'service_channel',
  'queue',
  'channel_queue',
  'sticky_assignment',
  'message_reaction',
] as const;

interface UseOpsAuditLogsOptions {
  entity: string;
  search: string;
}

export function useOpsAuditLogs({ entity, search }: UseOpsAuditLogsOptions) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('audit_logs')
      .select('id,user_id,action,entity_type,entity_id,created_at,details')
      .order('created_at', { ascending: false })
      .limit(100);

    if (entity === 'all') {
      q = q.in('entity_type', [...OPS_ENTITY_TYPES]);
    } else {
      q = q.eq('entity_type', entity);
    }
    if (search.trim()) q = q.ilike('action', `%${search.trim()}%`);

    const { data, error } = await q;
    if (error) toast.error('Erro ao carregar audit: ' + error.message);
    setRows((data as AuditRow[]) ?? []); // ignore-audit: narrows Supabase query result to local interface
    setLoading(false);
  }, [entity, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, load };
}
