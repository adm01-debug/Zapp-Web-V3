import { supabase } from '@/integrations/supabase/client';
import { normalizeBlockedIP } from '@/lib/normalizers';

export async function fetchBlockedIPs() {
  const { data, error } = await supabase
    .from('blocked_ips')
    .select('*')
    .order('blocked_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeBlockedIP);
}
