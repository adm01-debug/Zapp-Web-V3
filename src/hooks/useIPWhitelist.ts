import { supabase } from '@/integrations/supabase/client';

export interface WhitelistedIP {
  id: string;
  ip_address: string;
  description: string | null;
  added_by: string | null;
  created_at: string;
}

export async function fetchIPWhitelist(): Promise<WhitelistedIP[]> {
  const { data, error } = await supabase
    .from('ip_whitelist')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data;
}

export async function addIPToWhitelist(params: {
  ip_address: string;
  description: string | null;
  added_by: string | undefined;
}): Promise<{ error: { code: string } | null }> {
  const { error } = await supabase.from('ip_whitelist').insert(params);
  return { error: error ? { code: error.code } : null };
}

export async function removeIPFromWhitelist(id: string): Promise<void> {
  const { error } = await supabase.from('ip_whitelist').delete().eq('id', id);
  if (error) throw error;
}
