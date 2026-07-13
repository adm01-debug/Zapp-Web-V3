import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { ELEVENLABS_VOICES, type ElevenLabsVoice } from './VoiceSelector';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import {
  VoiceChangerHeader,
  CloneWarningPanel,
  VoiceListItem,
  VoiceChangerFooter,
} from './voiceChangerParts';

interface VoiceChangerProps {
  audioBlob?: Blob;
  audioUrl?: string;
  onVoiceChanged: (newBlob: Blob) => void;
  disabled?: boolean;
  messageId?: string;
  conversationId?: string;
  initialTaskId?: string | null;
}

export const VoiceChanger = memo(function VoiceChanger({
  audioBlob,
  audioUrl,
  onVoiceChanged,
  disabled,
  messageId,
  conversationId,
  initialTaskId,
}: VoiceChangerProps) {
  const [open, setOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<ElevenLabsVoice | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertedAudioUrl, setConvertedAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(initialTaskId || null);
  const [showCloneWarning, setShowCloneWarning] = useState(false);

  useEffect(() => {
    return () => {
      if (convertedAudioUrl) URL.revokeObjectURL(convertedAudioUrl);
    };
  }, [convertedAudioUrl]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

  const cleanup = useCallback(() => {
    stopPlayback();
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (convertedAudioUrl) {
      setConvertedAudioUrl(null);
    }
  }, [stopPlayback, convertedAudioUrl]);

  const handleConvert = async (voice: ElevenLabsVoice, retryCount = 0) => {
    const isCloned =
      voice.id.startsWith('cloned_') ||
      voice.description.toLowerCase().includes('celebridade') ||
      voice.description.toLowerCase().includes('dublagem');

    const conversionStartTime = Date.now();

    if (isCloned && !showCloneWarning) {
      setShowCloneWarning(true);
      setSelectedVoice(voice);
      return;
    }

    cleanup();
    setSelectedVoice(voice);
    setIsConverting(true);
    setConversionProgress(5);

    try {
      let activeBlob = audioBlob;
      if (!activeBlob && audioUrl) {
        setConversionProgress(10);
        const fetched = await fetch(audioUrl).then((r) => r.blob());
        activeBlob = fetched;
      }

      if (!activeBlob) throw new Error('Áudio base não encontrado');

      let taskId = activeTaskId;

      if (!taskId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: taskRows, error: queueError } = await safeClient.from(
          'voice_conversion_queue',
          (q) =>
            q
              .insert({
                input_audio_url: audioUrl || 'blob-input',
                voice_preset: voice.id,
                status: 'pending',
                user_id: user?.id,
                message_id: messageId,
                conversation_id: conversationId,
              })
              .select()
              .limit(1)
        );

        if (queueError) throw queueError;
        taskId = (taskRows as { id: string }[] | undefined)?.[0]?.id ?? null;
        setActiveTaskId(taskId);
      }

      const progressSteps = [15, 40, 65, 85];
      let currentStep = 0;
      progressIntervalRef.current = setInterval(() => {
        if (currentStep < progressSteps.length) {
          setConversionProgress(progressSteps[currentStep]);
          currentStep++;
        }
      }, 1500);

      const formData = new FormData();
      formData.append('audio', activeBlob, 'audio.webm');
      formData.append('voice_preset', voice.id);
      formData.append('task_id', taskId!);
      formData.append('authorized', isCloned ? 'true' : 'false');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-changer`,
        {
          method: 'POST',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!mountedRef.current) return;

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro na conversão' }));
        throw new Error(err.error || `Erro ${response.status}`);
      }

      setConversionProgress(100);
      const blob = await response.blob();
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      setConvertedAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      await audio.play();
      setIsPlaying(true);

      toast.success(`Voz convertida para ${voice.name}!`);
      setShowCloneWarning(false);

      void safeClient.rpc('record_voice_telemetry', {
        p_queue_id: taskId,
        p_duration_ms: Date.now() - conversionStartTime,
        p_status: 'completed',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      const conversionDuration = Date.now() - conversionStartTime;

      void safeClient.rpc('record_voice_telemetry', {
        p_queue_id: activeTaskId || '00000000-0000-0000-0000-000000000000',
        p_duration_ms: conversionDuration,
        p_status: 'failed',
        p_error_type: msg.substring(0, 50),
        p_error_detail: msg,
      });

      const MAX_RETRIES = 2;

      if (
        retryCount < MAX_RETRIES &&
        (msg.includes('502') || msg.includes('503') || msg.includes('504'))
      ) {
        const backoff = Math.pow(2, retryCount) * 1000;
        toast.info(
          `Falha temporária. Tentando novamente em ${backoff / 1000}s... (Tentativa ${retryCount + 1}/${MAX_RETRIES})`
        );
        setTimeout(() => handleConvert(voice, retryCount + 1), backoff);
        return;
      }

      toast.error(`Falha técnica: ${msg}`, {
        action: {
          label: 'Tentar agora',
          onClick: () => handleConvert(voice),
        },
      });
      setSelectedVoice(null);
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (mountedRef.current) {
        setIsConverting(false);
        setConversionProgress(0);
      }
    }
  };

  const proceedWithClonedVoice = useCallback(() => {
    setShowCloneWarning(false);
    if (selectedVoice) handleConvert(selectedVoice);
  }, [selectedVoice]);

  const handleConfirm = useCallback(() => {
    if (!convertedAudioUrl) return;
    fetch(convertedAudioUrl)
      .then((r) => r.blob())
      .then((blob) => {
        onVoiceChanged(blob);
        setOpen(false);
        cleanup();
        toast.success('Áudio com voz alterada pronto para envio!');
      });
  }, [convertedAudioUrl, onVoiceChanged, cleanup]);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !convertedAudioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [convertedAudioUrl, isPlaying]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) cleanup();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          disabled={disabled}
          title="Alterar voz com IA"
          aria-label="Alterar voz com IA"
        >
          <Wand2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] border-border bg-popover p-0"
        align="end"
        side="top"
        sideOffset={8}
      >
        <VoiceChangerHeader isConverting={isConverting} conversionProgress={conversionProgress} />

        <CloneWarningPanel
          show={showCloneWarning}
          onCancel={() => setShowCloneWarning(false)}
          onConfirm={proceedWithClonedVoice}
        />

        <div className="scrollbar-thin scrollbar-thumb-muted max-h-[280px] overflow-y-auto p-1.5">
          {ELEVENLABS_VOICES.map((voice) => (
            <VoiceListItem
              key={voice.id}
              voice={voice}
              isSelected={selectedVoice?.id === voice.id}
              isConverting={isConverting}
              convertedAudioUrl={convertedAudioUrl}
              onClick={() => !isConverting && handleConvert(voice)}
            />
          ))}
        </div>

        <VoiceChangerFooter
          show={Boolean(convertedAudioUrl && selectedVoice)}
          selectedVoiceName={selectedVoice?.name ?? ''}
          isPlaying={isPlaying}
          onTogglePlayback={togglePlayback}
          onConfirm={handleConfirm}
        />
      </PopoverContent>
    </Popover>
  );
});
