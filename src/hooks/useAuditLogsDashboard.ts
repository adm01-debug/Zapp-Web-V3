import { supabase } from '@/integrations/supabase/client';

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function fetchAuditLogs(
  actionFilter: string,
  entityFilter: string,
): Promise<AuditLog[]> {
  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (actionFilter) query = query.eq('action', actionFilter);
  if (entityFilter) query = query.eq('entity_type', entityFilter);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLog[];
}
