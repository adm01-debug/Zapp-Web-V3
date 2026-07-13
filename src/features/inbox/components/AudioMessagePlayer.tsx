import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Loader2,
  FileText,
  Volume2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Wand2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { AudioVolumeControl } from './AudioVolumeControl';
import { VoiceChanger } from './VoiceChanger';
import { Badge } from '@/components/ui/badge';
import { useAudioMessagePlayer } from './useAudioMessagePlayer';
import { TranscriptionStatusBadge } from './TranscriptionStatusBadge';

interface AudioMessagePlayerProps {
  audioUrl: string | null;
  messageId: string;
  isSent: boolean;
  existingTranscription?: string | null;
  transcriptionStatus?: string | null;
  /** When provided, enables Evolution `getMediaBase64` fallback for expired URLs (410/403). */
  refreshKey?: import('@/types/mediaRefresh').MediaRefreshKey;
  onVoiceChange?: (messageId: string, newBlob: Blob) => void;
  conversationId?: string;
}

export function AudioMessagePlayer({
  audioUrl,
  messageId,
  isSent,
  existingTranscription,
  transcriptionStatus: initialStatus,
  refreshKey,
  onVoiceChange,
  conversationId,
}: AudioMessagePlayerProps) {
  const {
    audioRef,
    resolvedUrl,
    isPlaying,
    isLoading,
    hasError,
    playbackRate,
    progress,
    waveformHeights,
    currentTime,
    duration,
    volume,
    setVolume,
    togglePlay,
    handleSeek,
    cycleSpeed,
    formatTime,
    resolveAudioUrl,
  } = useAudioPlayer({ audioUrl, messageId, refreshKey });

  const {
    transcription,
    transcriptionStatus,
    voiceStatus,
    voiceTaskId,
    voiceError,
    isProcessing,
    showTranscription,
    setShowTranscription,
    handleTranscribe,
  } = useAudioMessagePlayer({
    messageId,
    audioUrl,
    existingTranscription,
    transcriptionStatus: initialStatus,
    onVoiceChange,
    resolveAudioUrl,
  });

  if (!audioUrl && !isLoading) {
    return (
      <div
        className={cn(
          'flex animate-pulse items-center gap-3 rounded-lg border border-dashed p-3',
          isSent
            ? 'border-primary-foreground/20 bg-primary-foreground/5'
            : 'border-border bg-muted/20'
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Processando áudio...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        src={resolvedUrl || undefined}
        preload="metadata"
        crossOrigin="anonymous"
      />
      <div
        className={cn(
          'flex min-w-[200px] items-center gap-3 rounded-lg p-2',
          isSent ? 'bg-primary-foreground/10' : 'bg-muted/50'
        )}
      >
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button
            aria-label={
              hasError ? 'Tentar novamente' : isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'
            }
            variant="ghost"
            size="icon"
            className={cn(
              'h-10 w-10 rounded-full',
              hasError
                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                : isSent
                  ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
            )}
            onClick={togglePlay}
            disabled={isLoading || !resolvedUrl}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : hasError ? (
              <RefreshCw className="h-5 w-5" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" />
            )}
          </Button>
        </motion.div>
        <div className="flex-1 space-y-1">
          <div
            className="relative h-8 cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            onClick={handleSeek}
            role="slider"
            aria-label="Progresso do áudio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSeek({
                  currentTarget: e.currentTarget,
                  clientX:
                    e.currentTarget.getBoundingClientRect().left +
                    e.currentTarget.clientWidth * (progress / 100),
                });
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                const newTime = Math.min(duration, currentTime + 5);
                if (audioRef.current) audioRef.current.currentTime = newTime;
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const newTime = Math.max(0, currentTime - 5);
                if (audioRef.current) audioRef.current.currentTime = newTime;
              }
            }}
          >
            <div className="absolute inset-y-0 left-0 right-0 flex items-center gap-[2px]">
              {waveformHeights.map((height, i) => {
                const isActive = (i / 30) * 100 <= progress;
                return (
                  <motion.div
                    key={i}
                    initial={{ scaleY: 0.5 }}
                    animate={{ scaleY: isPlaying && isActive ? [0.6, 1, 0.6] : 1 }}
                    transition={{
                      duration: 0.5,
                      repeat: isPlaying && isActive ? Infinity : 0,
                      delay: i * 0.02,
                    }}
                    className={cn(
                      'flex-1 rounded-full transition-colors',
                      hasError
                        ? 'bg-destructive/30'
                        : isActive
                          ? isSent
                            ? 'bg-primary-foreground'
                            : 'bg-primary'
                          : isSent
                            ? 'bg-primary-foreground/30'
                            : 'bg-muted-foreground/30'
                    )}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          </div>
          <div
            className={cn(
              'flex justify-between text-[10px]',
              hasError
                ? 'text-destructive'
                : isSent
                  ? 'text-primary-foreground/70'
                  : 'text-muted-foreground'
            )}
          >
            {hasError ? (
              <span>Erro ao carregar — toque para tentar</span>
            ) : (
              <>
                <span>{formatTime(currentTime)}</span>
                <span>{duration ? formatTime(duration) : '--:--'}</span>
              </>
            )}
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <button
            onClick={cycleSpeed}
            className={cn(
              'h-6 rounded-full px-1.5 text-[10px] font-semibold transition-colors',
              playbackRate < 1
                ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                : isSent
                  ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
            )}
            title="Velocidade"
          >
            {playbackRate}x
          </button>
        </motion.div>
        <AudioVolumeControl volume={volume} onChange={setVolume} isSent={isSent} size="sm" />

        {isSent && onVoiceChange && (
          <VoiceChanger
            audioUrl={resolvedUrl}
            messageId={messageId}
            conversationId={conversationId}
            onVoiceChanged={(blob) => onVoiceChange(messageId, blob)}
            initialTaskId={voiceTaskId}
          />
        )}

        {voiceStatus && voiceStatus !== 'completed' && (
          <div className="ml-1 flex items-center gap-2">
            {voiceStatus === 'processing' ? (
              <Badge
                variant="outline"
                className="h-5 animate-pulse border-primary/20 bg-primary/10 text-[9px] text-primary"
              >
                <Wand2 className="mr-1 h-2.5 w-2.5" /> Alterando voz...
              </Badge>
            ) : voiceStatus === 'pending' ? (
              <Badge variant="outline" className="h-5 bg-muted text-[9px] text-muted-foreground">
                Na fila...
              </Badge>
            ) : voiceStatus === 'failed' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="h-5 cursor-pointer text-[9px]">
                    <AlertCircle className="mr-1 h-2.5 w-2.5" /> Falhou
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{voiceError || 'Erro na conversão'}</p>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        )}

        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button
            aria-label={transcription ? 'Mostrar/ocultar transcrição' : 'Transcrever áudio'}
            aria-expanded={transcription ? showTranscription : undefined}
            variant="ghost"
            size="icon"
            className={cn(
              'relative h-8 w-8',
              showTranscription && transcription
                ? isSent
                  ? 'text-primary-foreground'
                  : 'text-primary'
                : isSent
                  ? 'text-primary-foreground/50'
                  : 'text-muted-foreground'
            )}
            onClick={() => {
              if (!transcription && !isProcessing) handleTranscribe();
              else setShowTranscription(!showTranscription);
            }}
            disabled={isProcessing}
            title={transcription ? 'Mostrar/ocultar transcrição' : 'Transcrever áudio'}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {transcription && !showTranscription && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-success"
              />
            )}
          </Button>
        </motion.div>
      </div>

      <AnimatePresence>
        {(transcriptionStatus === 'processing' || transcriptionStatus === 'failed') && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            <TranscriptionStatusBadge
              transcriptionStatus={transcriptionStatus}
              isSent={isSent}
              transcription={transcription}
              onRetry={handleTranscribe}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTranscription && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'rounded-lg border p-3 text-xs',
              isSent
                ? 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/90'
                : 'border-border/30 bg-muted/50 text-foreground/80'
            )}
          >
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                </motion.div>
                <div className="flex-1">
                  <p className="font-medium">Transcrevendo áudio...</p>
                  <p className="mt-0.5 text-[10px] opacity-60">
                    A IA está convertendo o áudio em texto
                  </p>
                </div>
                <motion.div
                  className="flex gap-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        isSent ? 'bg-primary-foreground/50' : 'bg-primary/50'
                      )}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </motion.div>
              </div>
            ) : transcription ? (
              <div className="space-y-1">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] opacity-60">
                  <Volume2 className="h-3 w-3" />
                  <span>Transcrição</span>
                  <CheckCircle2 className="ml-auto h-3 w-3 text-success" />
                </div>
                <p className="italic leading-relaxed">"{transcription}"</p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="opacity-60">Transcrição não disponível</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={handleTranscribe}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Tentar novamente
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
