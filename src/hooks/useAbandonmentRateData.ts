import { supabase } from '@/integrations/supabase/client';

export async function fetchAbandonmentRateMessages(since: Date) {
  const { data, error } = await supabase
    .from('evolution_messages')
    .select('contact_id, sender')
    .gte('created_at', since.toISOString())
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}
