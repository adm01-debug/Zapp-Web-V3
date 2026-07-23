import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import { dbFrom, dbTable } from '@/integrations/datasource/db';

interface VoiceConversionRow {
  id: string;
  status: string | null;
  error_message: string | null;
  output_audio_url: string | null;
}

function isVoiceConversionRow(value: unknown): value is Partial<VoiceConversionRow> {
  return typeof value === 'object' && value !== null;
}

interface UseAudioMessagePlayerParams {
  messageId: string;
  audioUrl: string | null;
  existingTranscription?: string | null;
  transcriptionStatus?: string | null;
  onVoiceChange?: (messageId: string, newBlob: Blob) => void;
  resolveAudioUrl: (url: string | null) => Promise<string | null>;
}

/** Manages playback state and on-demand transcription for a single audio message, subscribing to realtime transcription_status updates. */
export function useAudioMessagePlayer({
  messageId,
  audioUrl,
  existingTranscription,
  transcriptionStatus: initialStatus,
  onVoiceChange,
  resolveAudioUrl,
}: UseAudioMessagePlayerParams) {
  const [transcription, setTranscription] = useState<string | null>(existingTranscription || null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>(
    initialStatus || 'pending'
  );
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [voiceTaskId, setVoiceTaskId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscription, setShowTranscription] = useState(!!existingTranscription);

  // Realtime subscription for transcription updates
  useEffect(() => {
    logMessagesSubscribe('AudioMessagePlayer', {
      event: 'UPDATE',
      table: dbTable('messages'),
      filter: `id=eq.${messageId}`,
    });
    const channel = supabase
      .channel(`transcription-${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo',
          table: 'evolution_messages',
          filter: `id=eq.${messageId}`,
        },
        wrapMessagesHandler<{ new: { transcription_status?: string; transcription?: string } }>(
          'AudioMessagePlayer',
          (payload) => {
            const newData = payload.new;
            if (newData.transcription_status) setTranscriptionStatus(newData.transcription_status);
            if (newData.transcription) {
              setTranscription(newData.transcription);
              setShowTranscription(true);
            }
          }
        )
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [messageId]);

  // Realtime subscription for voice conversion status
  useEffect(() => {
    const channel = supabase
      .channel(`voice-conversion-${messageId}`)
      .on<VoiceConversionRow>(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'voice_conversion_queue',
          filter: `message_id=eq.${messageId}`,
        },
        (payload) => {
          if (!isVoiceConversionRow(payload.new)) return;
          const row = payload.new;

          if (row.status) setVoiceStatus(row.status);
          if (row.error_message) setVoiceError(row.error_message);
          if (row.id) setVoiceTaskId(row.id);

          if (row.status === 'completed' && row.output_audio_url && onVoiceChange) {
            toast({
              title: 'Conversão concluída',
              description: 'A voz do áudio foi alterada com sucesso.',
            });
            void fetch(row.output_audio_url)
              .then((r) => r.blob())
              .then((blob) => onVoiceChange(messageId, blob))
              .catch((error) => log.error('Voice conversion audio fetch error:', error));
          }
        }
      )
      .subscribe();

    const fetchStatus = async () => {
      const { data } = await safeClient.from<VoiceConversionRow>('voice_conversion_queue', (q) =>
        q.select('*').eq('message_id', messageId).order('created_at', { ascending: false }).limit(1)
      );
      const row = data?.[0];
      if (row) {
        setVoiceStatus(row.status);
        setVoiceError(row.error_message);
        setVoiceTaskId(row.id);
      }
    };

    fetchStatus();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [messageId, onVoiceChange]);

  const handleTranscribe = async () => {
    if (isTranscribing || transcriptionStatus === 'processing') return;
    setIsTranscribing(true);
    setTranscriptionStatus('processing');
    setShowTranscription(true);
    try {
      const freshUrl = await resolveAudioUrl(audioUrl);
      const { data, error } = await supabase.functions.invoke('ai-transcribe-audio', {
        body: { audioUrl: freshUrl, messageId },
      });
      if (error) throw error;
      if (data?.fallback) {
        setTranscriptionStatus('failed');
        toast({
          title: 'Áudio não suportado',
          description: data.errorMessage || 'Não foi possível transcrever.',
          variant: 'destructive',
        });
        return;
      }
      if (data?.transcription) {
        setTranscription(data.transcription);
        setTranscriptionStatus('completed');
        await dbFrom('messages')
          .update({ transcription: data.transcription, transcription_status: 'completed' })
          .eq('id', messageId);
      }
    } catch (error) {
      log.error('Transcription error:', error);
      setTranscriptionStatus('failed');
      toast({
        title: 'Erro na transcrição',
        description: 'Não foi possível transcrever o áudio.',
        variant: 'destructive',
      });
      setTranscription(null);
    } finally {
      setIsTranscribing(false);
    }
  };

  const isProcessing = transcriptionStatus === 'processing' || isTranscribing;

  return {
    transcription,
    setTranscription,
    transcriptionStatus,
    voiceStatus,
    voiceTaskId,
    voiceError,
    isTranscribing,
    isProcessing,
    showTranscription,
    setShowTranscription,
    handleTranscribe,
  };
}
