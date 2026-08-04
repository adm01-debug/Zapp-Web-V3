import { supabase } from '@/integrations/supabase/client';
import { isValidUUID } from '@/utils/uuid';

/** Looks up the surrogate `profiles.id` for a given auth `user_id` UUID. Returns null if not found. */
export async function fetchProfileIdByUserId(userId: string) {
  const { data } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle();
  return data ?? null;
}

/** Inserts a contact note via the add_contact_note RPC (author resolved server-side). */
export async function insertContactNote(payload: {
  contact_id: string;
  content: string;
  author_id?: string; // legacy param — ignored; RPC resolves author via auth.uid()
  note_type?: string;
  is_pinned?: boolean;
}) {
  if (!isValidUUID(payload.contact_id)) return { data: null, error: new Error('Invalid UUID') };
  return (supabase as any).rpc('add_contact_note', {
    p_contact_id: payload.contact_id,
    p_content: payload.content,
    p_note_type: payload.note_type ?? 'general',
    p_is_pinned: payload.is_pinned ?? false,
  });
}
