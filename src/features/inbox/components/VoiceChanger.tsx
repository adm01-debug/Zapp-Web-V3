import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Wand2, Loader2, Play, Square, Check, Volume2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { ELEVENLABS_VOICES, type ElevenLabsVoice } from './VoiceSelector';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';

interface VoiceChangerProps {
  audioBlob?: Blob;
  audioUrl?: string;
  onVoiceChanged: (newBlob: Blob) => void;
  disabled?: boolean;
  messageId?: string;
  conversationId?: string;
  initialTaskId?: string | null;
}

export const VoiceChanger = memo(function VoiceChanger({ audioBlob, audioUrl, onVoiceChanged, disabled, messageId, conversationId, initialTaskId }: VoiceChangerProps) {
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
    return () => { mountedRef.current = false; };
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
      // Don't revoke here if we want to keep it while the popover is open
      // URL.revokeObjectURL(convertedAudioUrl);
      setConvertedAudioUrl(null);
    }
  }, [stopPlayback, convertedAudioUrl]);

  const handleConvert = async (voice: ElevenLabsVoice, retryCount = 0) => {
    // Check if it's a "cloned" voice (placeholder logic - usually based on ID prefix or metadata)
    const isCloned = voice.id.startsWith('cloned_') || voice.description.toLowerCase().includes('celebridade') || voice.description.toLowerCase().includes('dublagem');
    
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
        const fetched = await fetch(audioUrl).then(r => r.blob());
        activeBlob = fetched;
      }
      
      if (!activeBlob) throw new Error('Áudio base não encontrado');

      // 1. Create or get task in queue
      let taskId = activeTaskId;

      if (!taskId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: taskRows, error: queueError } = await safeClient.from<{ id: string }>(
          'voice_conversion_queue',
          (q) => q.insert({
            input_audio_url: audioUrl || 'blob-input',
            voice_preset: voice.id,
            status: 'pending',
            user_id: user?.id,
            message_id: messageId,
            conversation_id: conversationId,
          }).select(),
        );
        const task = taskRows[0] ?? null;

        if (queueError) throw queueError;
        taskId = task.id;
        setActiveTaskId(taskId);
      }

      // 2. Start STS via Edge Function
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
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
      
      // Update telemetry for successful local delivery
      void safeClient.rpc('record_voice_telemetry', {
        p_queue_id: taskId,
        p_duration_ms: Date.now() - conversionStartTime,
        p_status: 'completed',
      });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      const conversionDuration = Date.now() - conversionStartTime;
      
      // Update telemetry for local failure
      void safeClient.rpc('record_voice_telemetry', {
        p_queue_id: activeTaskId || '00000000-0000-0000-0000-000000000000',
        p_duration_ms: conversionDuration,
        p_status: 'failed',
        p_error_type: msg.substring(0, 50),
        p_error_detail: msg,
      });

      const MAX_RETRIES = 2;
      
      if (retryCount < MAX_RETRIES && (msg.includes('502') || msg.includes('503') || msg.includes('504'))) {
        const backoff = Math.pow(2, retryCount) * 1000;
        toast.info(`Falha temporária. Tentando novamente em ${backoff/1000}s... (Tentativa ${retryCount + 1}/${MAX_RETRIES})`);
        setTimeout(() => handleConvert(voice, retryCount + 1), backoff);
        return;
      }

      toast.error(`Falha técnica: ${msg}`, {
        action: {
          label: 'Tentar agora',
          onClick: () => handleConvert(voice)
        }
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
  }, [selectedVoice, handleConvert]);

  const handleConfirm = useCallback(() => {
    if (!convertedAudioUrl) return;

    fetch(convertedAudioUrl)
      .then(r => r.blob())
      .then(blob => {
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
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) cleanup(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-primary"
          disabled={disabled}
          title="Alterar voz com IA"
        >
          <Wand2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0 bg-popover border-border"
        align="end"
        side="top"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Wand2 className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Alterar Voz</h4>
          {isConverting && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px]  text-primary">{conversionProgress}%</span>
              <Loader2 className="w-3 h-3 text-primary animate-spin" />
            </div>
          )}
        </div>

        {/* Clone Warning */}
        <AnimatePresence>
          {showCloneWarning && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-3 bg-warning/10 border-b border-warning/20"
            >
              <Alert variant="default" className="bg-transparent border-none p-0">
                <ShieldAlert className="h-4 w-4 text-warning-foreground" />
                <AlertTitle className="text-xs font-bold text-warning-foreground">Aviso de Voz Clonada</AlertTitle>
                <AlertDescription className="text-[10px] leading-relaxed text-warning-foreground">
                  Esta voz parece ser uma voz clonada ou celebridade. Certifique-se de ter autorização legal para uso comercial ou pessoal desta imagem/voz.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" className="h-6 text-[9px] flex-1" onClick={() => setShowCloneWarning(false)}>Cancelar</Button>
                <Button size="sm" className="h-6 text-[9px] flex-1 bg-warning hover:bg-warning" onClick={proceedWithClonedVoice}>Eu tenho autorização</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice list */}
        <div className="max-h-[280px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-muted">
          {ELEVENLABS_VOICES.map((voice) => {
            const isSelected = selectedVoice?.id === voice.id;
            const isLoading = isConverting && isSelected;

            return (
              <button
                key={voice.id}
                data-testid={`voice-btn-${voice.id}`}
                onClick={() => !isConverting && handleConvert(voice)}
                disabled={isConverting}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left',
                  isSelected
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted/60 border border-transparent',
                  isConverting && !isSelected && 'opacity-50 cursor-not-allowed'
                )}
              >
                {/* Status indicator */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                  isSelected ? 'bg-primary/20' : 'bg-muted'
                )}>
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  ) : isSelected && convertedAudioUrl ? (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>

                {/* Voice info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{voice.name}</span>
                    <span className={cn(
                      'text-[9px] px-1 py-0.5 rounded',
                      voice.gender === 'female'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-info/10 text-info'
                    )}>
                      {voice.gender === 'female' ? '♀' : '♂'}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate block">
                    {voice.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer with preview and confirm */}
        <AnimatePresence>
          {convertedAudioUrl && selectedVoice && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-foreground"
                  onClick={togglePlayback}
                >
                  {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
                <span className="text-xs text-muted-foreground flex-1">
                  Voz: <span className="font-medium text-foreground">{selectedVoice.name}</span>
                </span>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-primary hover:bg-primary/90"
                  onClick={handleConfirm}
                >
                  Usar esta voz
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
});
