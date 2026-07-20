import { supabase } from '@/integrations/supabase/client';

interface AudioMemeInsertPayload {
  name: string;
  audio_url: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
  uploaded_by: string | null;
}

export async function insertAudioMeme(payload: AudioMemeInsertPayload) {
  const { error } = await supabase.from('audio_memes').insert(payload);
  if (error) throw error;
}
