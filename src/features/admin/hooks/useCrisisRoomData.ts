import { supabase } from '@/integrations/supabase/client';

export async function fetchActiveAgentsCount() {
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .in('role', ['agent', 'admin', 'supervisor']);
  return count ?? 0;
}

export async function fetchBreachedSLACount() {
  const { count } = await supabase
    .from('conversation_sla')
    .select('id', { count: 'exact', head: true })
    .eq('first_response_breached', true);
  return count ?? 0;
}
