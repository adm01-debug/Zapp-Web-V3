import { supabase } from '@/integrations/supabase/client';

export interface HealthLog {
  id: string;
  instance_id: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export async function fetchConnectionHealthLogs(): Promise<HealthLog[]> {
  const { data, error } = await supabase
    .from('connection_health_logs')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as HealthLog[];
}

export async function fetchConnectionHealthLogsTimeline(): Promise<
  Pick<HealthLog, 'id' | 'instance_id' | 'status' | 'checked_at'>[]
> {
  const { data, error } = await supabase
    .from('connection_health_logs')
    .select('id, instance_id, status, checked_at')
    .order('checked_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as Pick<HealthLog, 'id' | 'instance_id' | 'status' | 'checked_at'>[];
}
