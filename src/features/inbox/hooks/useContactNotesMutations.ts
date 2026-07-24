import { supabase } from '@/integrations/supabase/client';
import { isValidUUID } from '@/utils/uuid';

export async function fetchProfileIdByUserId(userId: string) {
  const { data } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle();
  return data ?? null;
}

export async function insertContactNote(payload: {
  contact_id: string;
  content: string;
  author_id: string;
}) {
  if (!isValidUUID(payload.contact_id)) return { data: null, error: new Error('Invalid UUID') };
  return supabase.from('contact_notes').insert(payload);
}
