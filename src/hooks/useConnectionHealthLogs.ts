import { supabase } from '@/integrations/supabase/client';

export interface HealthLog {
  id: string;
  instance_id: string;
  connection_id: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export interface ConnectionHealth {
  id: string;
  name: string;
  instance_name: string | null;
  status: string;
  phone_number: string | null;
  last_health_check: string | null;
  health_status: string | null;
  health_response_ms: number | null;
}

/**
 * Busca conexões WhatsApp com metadados de health check.
 * Extraído de ConnectionHealthPanel para respeitar o guardrail de data-layer
 * (components/pages não chamam supabase.from() diretamente).
 */
export async function fetchConnectionsHealth(): Promise<ConnectionHealth[]> {
  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select(
      'id, name, instance_name, status, phone_number, last_health_check, health_status, health_response_ms'
    )
    .order('name');
  if (error) throw error;
  return (data ?? []) as ConnectionHealth[];
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
