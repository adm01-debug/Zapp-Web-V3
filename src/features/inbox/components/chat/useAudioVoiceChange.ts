import { useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { dbFrom } from '@/integrations/datasource/db';

export function useAudioVoiceChange() {
  const handleAudioVoiceChange = useCallback(async (messageId: string, newBlob: Blob) => {
    try {
      toast({ title: 'Voz alterada!', description: 'Enviando nova versao do audio...' });
      const filePath = `audios/${Date.now()}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('audio-messages')
        .upload(filePath, newBlob);
      if (uploadError) throw uploadError;
      // Store the Supabase Storage URL (contains /storage/v1/) so the audio player's
      // resolveAudioUrl hook can extract bucket+path and generate a fresh signed URL
      // at render time (7-day TTL, regenerated on each play). This is the correct
      // pattern for private buckets — getPublicUrl() encodes the path, not auth.
      const {
        data: { publicUrl },
      } = supabase.storage.from('audio-messages').getPublicUrl(filePath);
      const { error: updateError } = await dbFrom('messages')
        .update({ media_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (updateError) throw updateError;
      toast({ title: 'Sucesso', description: 'Audio atualizado com a nova voz.' });
    } catch (err: unknown) {
      // ignore-audit
      log.error('Failed to change audio voice:', err);
      toast({
        title: 'Erro na conversao',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, []);

  return { handleAudioVoiceChange };
}
