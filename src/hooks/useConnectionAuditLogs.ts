import { supabase } from '@/integrations/supabase/client';

export interface AuditLog {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown>;
}

export async function fetchConnectionAuditLogs(instanceId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .contains('details', { instance_id: instanceId })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AuditLog[];
}
