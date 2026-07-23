import { supabase } from '@/integrations/supabase/client';

export async function fetchProfileIdByUserId(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

export async function insertContactNote(payload: {
  contact_id: string;
  content: string;
  author_id: string;
}) {
  return supabase.from('contact_notes').insert(payload);
}
