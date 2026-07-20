import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
}

export async function fetchActiveProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}
