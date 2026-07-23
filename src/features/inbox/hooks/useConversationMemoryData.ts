import { supabase } from '@/integrations/supabase/client';

export async function fetchConversationMemory(contactId: string) {
  const { data } = await supabase
    .from('conversation_memory')
    .select('*')
    .eq('contact_id', contactId)
    .maybeSingle();
  return data ?? null;
}

export async function saveConversationMemory(
  existingId: string | undefined,
  payload: {
    contact_id: string;
    facts: unknown;
    objections_handled: unknown;
    promises_made: unknown;
    pending_items: unknown;
    commercial_summary: string | null;
    cumulative_summary: string | null;
    updated_by: string | null;
  }
) {
  if (existingId) {
    return supabase.from('conversation_memory').update(payload).eq('id', existingId);
  }
  return supabase.from('conversation_memory').insert(payload);
}
