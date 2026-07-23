import { supabase } from '@/integrations/supabase/client';

export interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
  is_resolved: boolean;
}

export async function fetchUserSecurityAlerts(userId: string): Promise<SecurityAlert[]> {
  const { data, error } = await supabase
    .from('security_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as SecurityAlert[];
}
