import { supabase } from '@/integrations/supabase/client';

export async function insertWhisperMessage(payload: {
  contact_id: string;
  sender_id: string;
  content: string;
  target_agent_id: string;
}) {
  return supabase.from('whisper_messages').insert(payload);
}
