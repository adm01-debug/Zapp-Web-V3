import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Square, X, Pause, Play, Lock, CheckCircle2, Type, Loader2, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { VoiceChanger } from './VoiceChanger';
import { AudioVolumeControl } from './AudioVolumeControl';
import { useAudioRecorderUI } from './useAudioRecorderUI';

interface AudioRecorderProps {
  onSend?: (audioBlob: Blob) => void;
  onCancel?: () => void;
  onAudioReady?: (audioBlob: Blob) => void;
}

/** Audio Recorder component. */
export function AudioRecorder({ onSend, onCancel, onAudioReady }: AudioRecorderProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    isMobile,
    audioBlob,
    isConfirming,
    isPlaying,
    isLocked,
    playbackProgress,
    currentTime,
    showTranscription,
    setShowTranscription,
    isUploading,
    uploadProgress,
    volume,
    setVolume,
    isRecording,
    isPaused,
    duration,
    audioUrl,
    audioLevel,
    transcription,
    setTranscription,
    stopRecording,
    pauseRecording,
    resumeRecording,
    formatDuration,
    cancelOpacity,
    handlePlayPause,
    handleSend,
    handleCancel,
    handleVoiceChanged,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    setIsPlaying,
    setPlaybackProgress,
    setCurrentTime,
  } = useAudioRecorderUI(audioRef, onSend, onCancel, onAudioReady);

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
                role="slider"
                tabIndex={0}
                aria-label="Posição do áudio"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(playbackProgress)}
                className="group relative h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-muted"
                onClick={(e) => {
                  const audio = audioRef.current;
                  if (!audio || !audio.duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
                }}
                onKeyDown={(e) => {
                  const audio = audioRef.current;
                  if (!audio || !audio.duration) return;
                  if (e.key === 'ArrowRight')
                    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
                  if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
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
                        className="min-h-[60px] w-full resize-none border-t border-border/30 bg-transparent pt-2 text-sm font-medium italic leading-relaxed text-foreground/80 outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-primary/50"
                        placeholder="Edite a transcrição aqui..."
                        aria-label="Editar transcrição de áudio"
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
                    onClick={handleSend}
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
