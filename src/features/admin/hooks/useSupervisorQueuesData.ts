import { supabase } from '@/integrations/supabase/client';

export async function fetchSupervisorQueues() {
  const { data } = await supabase.from('queues').select('id, name').limit(20);
  return data ?? [];
}
