import { supabase } from '@/integrations/supabase/client';

export async function fetchActiveChannelConnections() {
  const { data, error } = await supabase
    .from('channel_connections_safe')
    .select('*')
    .eq('is_active', true);
  if (error) throw error;
  return data ?? [];
}
