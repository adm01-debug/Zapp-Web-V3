import { supabase } from '@/integrations/supabase/client';

export async function fetchContactMessagesForHeatmap(since: Date) {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at')
    .gte('created_at', since.toISOString())
    .eq('sender', 'contact')
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}
