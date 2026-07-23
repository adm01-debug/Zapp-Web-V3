import { supabase } from '@/integrations/supabase/client';

export async function fetchMentionableProfiles() {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('is_active', true)
    .limit(20);
  return data ?? [];
}
