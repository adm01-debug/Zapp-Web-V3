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
      const {
        data: { publicUrl },
      } = supabase.storage.from('audio-messages').getPublicUrl(filePath);
      await dbFrom('messages')
        .update({ mediaUrl: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', messageId);
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
