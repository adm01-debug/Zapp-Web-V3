import { supabase } from '@/integrations/supabase/client';

export async function insertBlockedIP(payload: {
  ip_address: string;
  reason: string;
  is_permanent: boolean;
  expires_at: string | null;
  blocked_by: string | undefined;
}): Promise<{ error: { code?: string; message: string } | null }> {
  const { error } = await supabase.from('blocked_ips').insert(payload);
  return { error };
}

export async function deleteBlockedIP(id: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('blocked_ips').delete().eq('id', id);
  return { error };
}
