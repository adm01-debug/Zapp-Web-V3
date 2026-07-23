import { supabase } from '@/integrations/supabase/client';
import { normalizeSecurityAlert, type NormalizedSecurityAlert } from '@/lib/normalizers';

export async function fetchUnresolvedSecurityAlerts(): Promise<NormalizedSecurityAlert[]> {
  const { data, error } = await supabase
    .from('security_alerts')
    .select('*')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((row) =>
    normalizeSecurityAlert(row as unknown as Record<string, unknown>)
  );
}

export async function resolveSecurityAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from('security_alerts')
    .update({ is_resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', alertId);
  if (error) throw error;
}
