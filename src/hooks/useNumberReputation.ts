import { supabase } from '@/integrations/supabase/client';

export interface ReputationData {
  id: string;
  whatsapp_connection_id: string;
  health_score: number;
  messages_sent_today: number;
  failures_today: number;
  complaints_count: number;
  warmup_status: string;
  warmup_day: number | null;
  daily_limit: number | null;
}

export interface ConnectionInfo {
  id: string;
  instance_id: string;
  phone_number: string | null;
}

export async function fetchNumberReputations(): Promise<
  (ReputationData & { connection?: ConnectionInfo })[]
> {
  const { data: reps } = await supabase.from('number_reputation').select('*');
  const { data: connections } = await supabase
    .from('whatsapp_connections')
    .select('id, instance_id, phone_number');
  if (!reps) return [];
  return reps.map((r) => ({
    ...r,
    connection: connections?.find((c) => c.id === r.whatsapp_connection_id) as
      | ConnectionInfo
      | undefined,
  }));
}

export async function startReputationWarmup(id: string): Promise<void> {
  await supabase
    .from('number_reputation')
    .update({ warmup_status: 'active', warmup_day: 1, daily_limit: 20 })
    .eq('id', id);
}
