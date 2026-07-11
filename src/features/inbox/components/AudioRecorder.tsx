import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Square,
  X,
  Pause,
  Play,
  Lock,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Type,
  Loader2,
  Undo2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { VoiceChanger } from './VoiceChanger';
import { useIsMobile } from '@/hooks/use-mobile';
import { AudioVolumeControl } from './AudioVolumeControl';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
const log = getLogger('AudioRecorder');

interface AudioRecorderProps {
  onSend?: (audioBlob: Blob) => void;
  onCancel?: () => void;
  onAudioReady?: (audioBlob: Blob) => void;
}

export function AudioRecorder({ onSend, onCancel, onAudioReady }: AudioRecorderProps) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [_voiceChanged, setVoiceChanged] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showTranscription, setShowTranscription] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [_lastCancelledAudio, setLastCancelledAudio] = useState<{ blob: Blob; url: string } | null>(
    null
  );
  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('audio-player:volume');
      const n = saved !== null ? parseFloat(saved) : 1;
      return isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    } catch {
      return 1;
    }
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMobile = useIsMobile();

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    try {
      localStorage.setItem('audio-player:volume', String(clamped));
    } catch {
      /* noop */
    }
  }, []);

  // Apply volume to <audio> when it mounts/changes source
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Swipe-to-cancel
  const swipeX = useMotionValue(0);
  const cancelOpacity = useTransform(swipeX, [-120, -60, 0], [1, 0.5, 0]);
  const swipeRef = useRef({ startX: 0, isSwiping: false });

  const {
    isRecording,
    isPaused,
    duration,
    audioUrl,
    audioLevel,
    transcription,
    setTranscription,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    restoreRecording,
    formatDuration,
  } = useAudioRecorder({
    onRecordingComplete: (blob, _url) => {
      setAudioBlob(blob);
      setIsConfirming(true);
      onAudioReady?.(blob);
    },
  });

  // Keyboard Shortcuts - ONLY active when the panel is shown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input, textarea or contenteditable
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (isRecording || isPaused) {
        if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          if (isPaused) {
            resumeRecording();
          } else {
            pauseRecording();
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPaused, resumeRecording, pauseRecording]);

  useEffect(() => {
    startRecording();
    return () => cancelRecording();
  }, []);

  // Playback progress tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) {
        setPlaybackProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    audio.addEventListener('timeupdate', updateProgress);
    return () => audio.removeEventListener('timeupdate', updateProgress);
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSendAction = () => handleSend(0);

  const handleSend = async (retryCount = 0) => {
    if (!audioBlob) return;

    setIsUploading(true);
    setUploadProgress(10 * (retryCount + 1));

    try {
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 95) {
            clearInterval(interval);
            return 95;
          }
          return prev + 5;
        });
      }, 300);

      const startTime = Date.now();

      // We pass the transcription along with the audio if edited
      await onSend?.(audioBlob);

      const durationMs = Date.now() - startTime;
      log.info(
        `[INBOX_METRIC] action=audio_upload_success size=${audioBlob.size} duration=${durationMs}ms`
      );

      clearInterval(interval);
      setUploadProgress(100);
      toast({ title: 'Áudio enviado com sucesso!' });

      // After success, clear states
      setAudioBlob(null);
      setIsConfirming(false);
    } catch (error: any) {
      log.error(`Audio send failed (attempt ${retryCount + 1}):`, error);
      const canRetry = retryCount < 3; // Allowing up to 3 retries as requested

      toast({
        title: 'Erro no envio',
        description: canRetry
          ? `Falha técnica (${error.message || 'Erro desconhecido'}). Tentando novamente em breve (Tentativa ${retryCount + 1}/4)...`
          : 'Não foi possível enviar o áudio após várias tentativas. Verifique sua conexão.',
        variant: 'destructive',
        action: (
          <Button variant="outline" size="sm" onClick={() => handleSend(retryCount + 1)}>
            <RotateCcw className="mr-1 h-3 w-3" /> Tentar agora
          </Button>
        ),
      });

      // Auto-retry with backoff if it's a network issue or transient
      if (canRetry) {
        setTimeout(() => handleSend(retryCount + 1), Math.pow(2, retryCount) * 1000);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    if ((isRecording || isPaused) && duration > 2) {
      toast({
        title: 'Gravação descartada',
        description: 'Você pode desfazer esta ação nos próximos segundos.',
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndoCancel}
            className="gap-2 font-bold text-primary"
          >
            <Undo2 className="h-4 w-4" /> Desfazer
          </Button>
        ),
      });
      cancelRecording(true);
    } else {
      cancelRecording(false);
    }
    onCancel?.();
  };

  const handleUndoCancel = () => {
    const recovered = restoreRecording();
    if (recovered) {
      toast({ title: 'Áudio recuperado!', description: 'Continue revisando sua gravação.' });
    }
  };

  const handleVoiceChanged = (newBlob: Blob) => {
    setAudioBlob(newBlob);
    setVoiceChanged(true);
    if (audioRef.current) {
      const url = URL.createObjectURL(newBlob);
      audioRef.current.src = url;
    }
  };

  // Lock recording (stop holding, keep recording)
  const _handleLock = useCallback(() => {
    setIsLocked(true);
  }, []);

  // Swipe-to-cancel handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    swipeRef.current.startX = e.touches[0].clientX;
    swipeRef.current.isSwiping = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipeRef.current.isSwiping || !isRecording) return;
    const delta = e.touches[0].clientX - swipeRef.current.startX;
    if (delta < 0) {
      swipeX.set(delta);
    }
  };

  const handleTouchEnd = () => {
    if (swipeX.get() < -100) {
      handleCancel();
    }
    swipeX.set(0);
    swipeRef.current.isSwiping = false;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3"
      onTouchStart={isRecording && isMobile ? handleTouchStart : undefined}
      onTouchMove={isRecording && isMobile ? handleTouchMove : undefined}
      onTouchEnd={isRecording && isMobile ? handleTouchEnd : undefined}
    >
      {/* Swipe-to-cancel overlay (mobile only) */}
      {isRecording && isMobile && (
        <motion.div
          style={{ opacity: cancelOpacity }}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-destructive/10"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Trash2 className="h-4 w-4" />
            Deslize para cancelar
          </div>
        </motion.div>
      )}

      {/* Cancel button */}
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-destructive hover:text-destructive md:h-10 md:w-10"
          onClick={handleCancel}
          disabled={isUploading}
          aria-label="Cancelar gravação"
        >
          <X className="h-5 w-5" />
        </Button>
      </motion.div>

      {/* Recording indicator or playback */}
      <div className="flex flex-1 items-center gap-3">
        {isRecording || isPaused ? (
          <>
            <motion.div
              animate={isPaused ? { scale: 1 } : { scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: isPaused ? 0 : Infinity }}
              className={cn(
                'h-3 w-3 shrink-0 rounded-full shadow-lg',
                isPaused ? 'bg-warning' : 'bg-destructive'
              )}
            />
            <div className="flex flex-1 items-center gap-3">
              {/* Waveform Visualization Grid */}
              <div className="group relative flex h-12 flex-1 items-center gap-[2px] overflow-hidden rounded-xl border-2 border-border/40 bg-muted/30 px-3">
                <div className="pointer-events-none absolute inset-0 grid grid-cols-12 opacity-10">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="h-full border-r border-foreground/50" />
                  ))}
                </div>

                {Array.from({ length: isMobile ? 25 : 50 }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: isPaused ? 6 : [6, audioLevel * (35 + Math.random() * 15) + 6, 6],
                      opacity: isPaused ? 0.4 : 1,
                    }}
                    transition={{
                      duration: 0.15,
                      repeat: isPaused ? 0 : Infinity,
                      delay: i * 0.005,
                    }}
                    className={cn(
                      'w-1 rounded-full transition-colors',
                      isPaused
                        ? 'bg-warning/60'
                        : 'bg-destructive shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                    )}
                  />
                ))}

                {/* Real-time transcription preview (subtle) */}
                {transcription && !isPaused && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    className="absolute bottom-1 left-3 right-3 truncate text-[9px] font-medium italic text-foreground/40"
                  >
                    "{transcription}"
                  </motion.div>
                )}
              </div>

              {/* Timer & Status */}
              <div className="flex min-w-[80px] flex-col items-end">
                <span
                  className={cn(
                    'text-lg font-black tabular-nums tracking-tight',
                    isPaused ? 'text-warning-foreground' : 'text-destructive'
                  )}
                >
                  {formatDuration(duration)}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70">
                  {isPaused ? 'Pausa' : 'Ao vivo'}
                </span>
              </div>
            </div>
          </>
        ) : audioUrl ? (
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePlayPause}
                className="h-10 w-10 shrink-0 rounded-full bg-primary/5 text-primary hover:bg-primary/10"
                aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 fill-current" />
                )}
              </Button>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => {
                  setIsPlaying(false);
                  setPlaybackProgress(0);
                  setCurrentTime(0);
                }}
                onLoadedMetadata={(e) => {
                  (e.currentTarget as HTMLAudioElement).volume = volume;
                }}
                className="hidden"
              />
              <div
                className="group relative h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-muted"
                onClick={(e) => {
                  const audio = audioRef.current;
                  if (!audio || !audio.duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
                }}
              >
                <div className="absolute inset-0 bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
                <motion.div
                  className="relative h-full bg-primary"
                  style={{ width: `${playbackProgress}%` }}
                >
                  <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 scale-0 rounded-full bg-primary shadow-lg transition-transform group-hover:scale-100" />
                </motion.div>
              </div>
              <span className="min-w-[90px] text-right text-xs font-bold tabular-nums text-muted-foreground">
                {formatDuration(Math.floor(currentTime))} / {formatDuration(duration)}
              </span>
              <AudioVolumeControl volume={volume} onChange={setVolume} size="sm" />
            </div>

            {/* Transcription Toggle & Content */}
            {transcription && (
              <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <Type className="h-3 w-3" /> Transcrição Editável
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-black uppercase hover:bg-primary/5"
                    onClick={() => setShowTranscription(!showTranscription)}
                  >
                    {showTranscription ? 'Recolher' : 'Editar'}
                  </Button>
                </div>
                <AnimatePresence>
                  {showTranscription && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <textarea
                        value={transcription}
                        onChange={(e) => setTranscription(e.target.value)}
                        className="min-h-[60px] w-full resize-none border-t border-border/30 bg-transparent pt-2 text-sm font-medium italic leading-relaxed text-foreground/80 outline-none"
                        placeholder="Edite a transcrição aqui..."
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Stop/Send controls */}
      {isRecording || isPaused ? (
        <div className="flex items-center gap-2">
          {/* Upload Progress Overlay */}
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 p-6 backdrop-blur-md"
              >
                <div className="w-full max-w-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm font-bold uppercase tracking-widest text-primary">
                        Enviando Áudio...
                      </span>
                    </div>
                    <span className="text-xs font-bold text-primary">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-primary/10">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="animate-pulse text-center text-[10px] text-muted-foreground">
                    O áudio está sendo processado e enviado para a conversa.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pause/Resume Toggle */}
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'h-9 w-9 border-2',
                isPaused
                  ? 'border-warning text-warning-foreground hover:bg-warning'
                  : 'border-destructive text-destructive hover:bg-destructive'
              )}
              onClick={isPaused ? resumeRecording : pauseRecording}
              aria-label={isPaused ? 'Retomar gravação' : 'Pausar gravação'}
            >
              {isPaused ? (
                <Play className="h-4 w-4 fill-current" />
              ) : (
                <Pause className="h-4 w-4 fill-current" />
              )}
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              size="icon"
              className="h-9 w-9 bg-destructive shadow-md hover:bg-destructive"
              onClick={stopRecording}
              disabled={isUploading}
              aria-label="Concluir gravação"
            >
              <Square className="h-4 w-4 fill-white" />
            </Button>
          </motion.div>
        </div>
      ) : isConfirming && audioBlob ? (
        <div className="flex items-center gap-2">
          {/* Lock state visualization */}
          {isLocked && (
            <div className="hidden items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-primary md:flex">
              <Lock className="h-3 w-3" /> Fixado
            </div>
          )}

          <VoiceChanger audioBlob={audioBlob} onVoiceChanged={handleVoiceChanged} />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    size="icon"
                    className="h-9 w-9 bg-primary shadow-md hover:bg-primary/90 md:h-10 md:w-10"
                    onClick={handleSendAction}
                    aria-label="Confirmar e enviar áudio"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </Button>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="top">Enviar Áudio</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : null}
    </motion.div>
  );
}
