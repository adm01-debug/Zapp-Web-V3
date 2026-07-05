import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Square, X, Pause, Play, Lock, Trash2, CheckCircle2, RotateCcw, Type, Loader2, Undo2 } from 'lucide-react';
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
  const [voiceChanged, setVoiceChanged] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showTranscription, setShowTranscription] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastCancelledAudio, setLastCancelledAudio] = useState<{blob: Blob, url: string} | null>(null);
  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('audio-player:volume');
      const n = saved !== null ? parseFloat(saved) : 1;
      return isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    } catch { return 1; }
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMobile = useIsMobile();

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    try { localStorage.setItem('audio-player:volume', String(clamped)); } catch { /* noop */ }
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
    onRecordingComplete: (blob, url) => {
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
          isPaused ? resumeRecording() : pauseRecording();
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
        setUploadProgress(prev => {
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
      log.info(`[INBOX_METRIC] action=audio_upload_success size=${audioBlob.size} duration=${durationMs}ms`);
      
      clearInterval(interval);
      setUploadProgress(100);
      toast({ title: "Áudio enviado com sucesso!" });
      
      // After success, clear states
      setAudioBlob(null);
      setIsConfirming(false);
    } catch (error: any) {
      log.error(`Audio send failed (attempt ${retryCount + 1}):`, error);
      const canRetry = retryCount < 3; // Allowing up to 3 retries as requested
      
      toast({
        title: "Erro no envio",
        description: canRetry 
          ? `Falha técnica (${error.message || 'Erro desconhecido'}). Tentando novamente em breve (Tentativa ${retryCount + 1}/4)...` 
          : "Não foi possível enviar o áudio após várias tentativas. Verifique sua conexão.",
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={() => handleSend(retryCount + 1)}>
            <RotateCcw className="w-3 h-3 mr-1" /> Tentar agora
          </Button>
        )
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
        title: "Gravação descartada",
        description: "Você pode desfazer esta ação nos próximos segundos.",
        action: (
          <Button variant="outline" size="sm" onClick={handleUndoCancel} className="gap-2 font-bold text-primary">
            <Undo2 className="w-4 h-4" /> Desfazer
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
      toast({ title: "Áudio recuperado!", description: "Continue revisando sua gravação." });
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
  const handleLock = useCallback(() => {
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
      className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl relative overflow-hidden"
      onTouchStart={isRecording && isMobile ? handleTouchStart : undefined}
      onTouchMove={isRecording && isMobile ? handleTouchMove : undefined}
      onTouchEnd={isRecording && isMobile ? handleTouchEnd : undefined}
    >
      {/* Swipe-to-cancel overlay (mobile only) */}
      {isRecording && isMobile && (
        <motion.div
          style={{ opacity: cancelOpacity }}
          className="absolute inset-0 flex items-center justify-center bg-destructive/10 pointer-events-none z-10"
        >
          <div className="flex items-center gap-2 text-destructive text-sm font-medium">
            <Trash2 className="w-4 h-4" />
            Deslize para cancelar
          </div>
        </motion.div>
      )}

      {/* Cancel button */}
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive h-9 w-9 md:h-10 md:w-10"
          onClick={handleCancel}
          disabled={isUploading}
          aria-label="Cancelar gravação"
        >
          <X className="w-5 h-5" />
        </Button>
      </motion.div>

      {/* Recording indicator or playback */}
      <div className="flex-1 flex items-center gap-3">
        {isRecording || isPaused ? (
          <>
            <motion.div
              animate={isPaused ? { scale: 1 } : { scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: isPaused ? 0 : Infinity }}
              className={cn("w-3 h-3 rounded-full shrink-0 shadow-lg", isPaused ? "bg-warning" : "bg-destructive")}
            />
            <div className="flex-1 flex items-center gap-3">
              {/* Waveform Visualization Grid */}
              <div className="h-12 flex-1 flex items-center gap-[2px] bg-muted/30 rounded-xl px-3 border-2 border-border/40 relative overflow-hidden group">
                <div className="absolute inset-0 grid grid-cols-12 opacity-10 pointer-events-none">
                  {Array.from({length: 12}).map((_, i) => <div key={i} className="border-r border-foreground/50 h-full" />)}
                </div>
                
                {Array.from({ length: isMobile ? 25 : 50 }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: isPaused ? 6 : [6, (audioLevel * (35 + Math.random() * 15)) + 6, 6],
                      opacity: isPaused ? 0.4 : 1
                    }}
                    transition={{
                      duration: 0.15,
                      repeat: isPaused ? 0 : Infinity,
                      delay: i * 0.005,
                    }}
                    className={cn(
                      "w-1 rounded-full transition-colors", 
                      isPaused ? "bg-warning/60" : "bg-destructive shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                    )}
                  />
                ))}
                
                {/* Real-time transcription preview (subtle) */}
                {transcription && !isPaused && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 0.6 }}
                    className="absolute bottom-1 left-3 right-3 text-[9px] truncate font-medium text-foreground/40 italic"
                  >
                    "{transcription}"
                  </motion.div>
                )}
              </div>
              
              {/* Timer & Status */}
              <div className="flex flex-col items-end min-w-[80px]">
                <span className={cn(
                  "text-lg  font-black tabular-nums tracking-tight",
                  isPaused ? "text-warning-foreground" : "text-destructive"
                )}>
                  {formatDuration(duration)}
                </span>
                <span className="text-[9px] uppercase font-black tracking-widest opacity-70">
                  {isPaused ? 'Pausa' : 'Ao vivo'}
                </span>
              </div>
            </div>
          </>
        ) : audioUrl ? (
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePlayPause}
                className="text-primary shrink-0 bg-primary/5 hover:bg-primary/10 rounded-full h-10 w-10"
                aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </Button>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => { setIsPlaying(false); setPlaybackProgress(0); setCurrentTime(0); }}
                onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = volume; }}
                className="hidden"
              />
              <div
                className="flex-1 h-3 bg-muted rounded-full overflow-hidden cursor-pointer relative group"
                onClick={(e) => {
                  const audio = audioRef.current;
                  if (!audio || !audio.duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
                }}
              >
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <motion.div
                  className="h-full bg-primary relative"
                  style={{ width: `${playbackProgress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform" />
                </motion.div>
              </div>
              <span className="text-xs  font-bold text-muted-foreground tabular-nums min-w-[90px] text-right">
                {formatDuration(Math.floor(currentTime))} / {formatDuration(duration)}
              </span>
              <AudioVolumeControl volume={volume} onChange={setVolume} size="sm" />
            </div>

            {/* Transcription Toggle & Content */}
            {transcription && (
              <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    <Type className="w-3 h-3" /> Transcrição Editável
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-[10px] uppercase font-black px-2 hover:bg-primary/5"
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
                        className="w-full bg-transparent text-sm text-foreground/80 italic leading-relaxed font-medium border-t border-border/30 pt-2 outline-none resize-none min-h-[60px]"
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
                className="absolute inset-0 z-50 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center p-6"
              >
                <div className="w-full max-w-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm font-bold uppercase tracking-widest text-primary">Enviando Áudio...</span>
                    </div>
                    <span className="text-xs  font-bold text-primary">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-primary/10 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center animate-pulse">
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
                "h-9 w-9 border-2",
                isPaused 
                  ? "border-warning text-warning-foreground hover:bg-warning" 
                  : "border-destructive text-destructive hover:bg-destructive"
              )}
              onClick={isPaused ? resumeRecording : pauseRecording}
              aria-label={isPaused ? "Retomar gravação" : "Pausar gravação"}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              size="icon"
              className="bg-destructive hover:bg-destructive shadow-md h-9 w-9"
              onClick={stopRecording}
              disabled={isUploading}
              aria-label="Concluir gravação"
            >
              <Square className="w-4 h-4 fill-white" />
            </Button>
          </motion.div>
        </div>
      ) : isConfirming && audioBlob ? (
        <div className="flex items-center gap-2">
          {/* Lock state visualization */}
          {isLocked && (
            <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-tighter bg-primary/5 px-2 py-1 rounded-full border border-primary/20">
              <Lock className="w-3 h-3" /> Fixado
            </div>
          )}
          
          <VoiceChanger
            audioBlob={audioBlob}
            onVoiceChanged={handleVoiceChanged}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    size="icon"
                    className="bg-primary hover:bg-primary/90 shadow-md h-9 w-9 md:h-10 md:w-10"
                    onClick={handleSendAction}
                    aria-label="Confirmar e enviar áudio"
                  >
                    <CheckCircle2 className="w-5 h-5" />
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
