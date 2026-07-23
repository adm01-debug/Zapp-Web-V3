import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { useMotionValue, useTransform } from 'framer-motion';
import { useAudioRecorder } from '@/hooks/useAudioManagement';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
import { ToastAction } from '@/components/ui/toast';
import { RotateCcw, Undo2 } from 'lucide-react';
import React from 'react';

const log = getLogger('AudioRecorder');

function loadVolume(): number {
  try {
    const saved = localStorage.getItem('audio-player:volume');
    const n = saved !== null ? parseFloat(saved) : 1;
    return isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  } catch {
    return 1;
  }
}

/** use Audio Recorder UI component. */
export function useAudioRecorderUI(
  audioRef: RefObject<HTMLAudioElement>,
  onSend?: (audioBlob: Blob) => void,
  onCancel?: () => void,
  onAudioReady?: (audioBlob: Blob) => void
) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [_voiceChanged, setVoiceChanged] = useState(false);
  const [isLocked] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showTranscription, setShowTranscription] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [volume, setVolumeState] = useState<number>(loadVolume);

  const isMobile = useIsMobile();

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.min(1, Math.max(0, v));
      setVolumeState(clamped);
      if (audioRef.current) audioRef.current.volume = clamped;
      try {
        localStorage.setItem('audio-player:volume', String(clamped));
      } catch {
        /* noop */
      }
    },
    [audioRef]
  );

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, audioRef]);

  // Swipe-to-cancel (mobile)
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

  const handleCancel = useCallback(() => {
    if ((isRecording || isPaused) && duration > 2) {
      toast({
        title: 'Gravação descartada',
        description: 'Você pode desfazer esta ação nos próximos segundos.',
        action: React.createElement(
          ToastAction,
          {
            altText: 'Desfazer descarte da gravação',
            onClick: handleUndoCancel,
            className: 'gap-2 font-bold text-primary',
          },
          React.createElement(Undo2, { className: 'h-4 w-4' }),
          ' Desfazer'
        ),
      });
      cancelRecording(true);
    } else {
      cancelRecording(false);
    }
    onCancel?.();
    // handleUndoCancel is stable — defined right below and only uses restoreRecording (stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isPaused, duration, cancelRecording, onCancel]);

  const handleUndoCancel = useCallback(() => {
    const recovered = restoreRecording();
    if (recovered) {
      toast({ title: 'Áudio recuperado!', description: 'Continue revisando sua gravação.' });
    }
  }, [restoreRecording]);

  // Keyboard shortcuts — only active when recording/paused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [isRecording, isPaused, resumeRecording, pauseRecording, handleCancel]);

  // Auto-start recording on mount
  useEffect(() => {
    startRecording();
    return () => cancelRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Playback progress tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateProgress = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setPlaybackProgress((audio.currentTime / audio.duration) * 100);
    };
    audio.addEventListener('timeupdate', updateProgress);
    return () => audio.removeEventListener('timeupdate', updateProgress);
  }, [audioUrl, audioRef]);

  const handlePlayPause = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [audioRef, audioUrl, isPlaying]);

  const handleSend = useCallback(
    async (retryCount = 0) => {
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
        await onSend?.(audioBlob);
        const durationMs = Date.now() - startTime;
        log.info(
          `[INBOX_METRIC] action=audio_upload_success size=${audioBlob.size} duration=${durationMs}ms`
        );

        clearInterval(interval);
        setUploadProgress(100);
        toast({ title: 'Áudio enviado com sucesso!' });
        setAudioBlob(null);
        setIsConfirming(false);
      } catch (error: unknown) {
        log.error(`Audio send failed (attempt ${retryCount + 1}):`, error);
        const canRetry = retryCount < 3;
        toast({
          title: 'Erro no envio',
          description: canRetry
            ? `Falha técnica (${error instanceof Error ? error.message : 'Erro desconhecido'}). Tentando novamente em breve (Tentativa ${retryCount + 1}/4)...`
            : 'Não foi possível enviar o áudio após várias tentativas. Verifique sua conexão.',
          variant: 'destructive',
          action: React.createElement(
            ToastAction,
            {
              altText: 'Tentar enviar o áudio novamente agora',
              onClick: () => void handleSend(retryCount + 1),
            },
            React.createElement(RotateCcw, { className: 'mr-1 h-3 w-3' }),
            ' Tentar agora'
          ),
        });
        if (canRetry)
          setTimeout(() => void handleSend(retryCount + 1), Math.pow(2, retryCount) * 1000);
      } finally {
        setIsUploading(false);
      }
    },
    [audioBlob, onSend]
  );

  const handleVoiceChanged = useCallback(
    (newBlob: Blob) => {
      setAudioBlob(newBlob);
      setVoiceChanged(true);
      if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(newBlob);
      }
    },
    [audioRef]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeRef.current.startX = e.touches[0].clientX;
    swipeRef.current.isSwiping = true;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!swipeRef.current.isSwiping || !isRecording) return;
      const delta = e.touches[0].clientX - swipeRef.current.startX;
      if (delta < 0) swipeX.set(delta);
    },
    [isRecording, swipeX]
  );

  const handleTouchEnd = useCallback(() => {
    if (swipeX.get() < -100) handleCancel();
    swipeX.set(0);
    swipeRef.current.isSwiping = false;
  }, [swipeX, handleCancel]);

  return {
    // Derived / external state
    isMobile,
    // Local state
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
    // From useAudioRecorder
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
    // Motion values
    swipeX,
    cancelOpacity,
    // Handlers
    handlePlayPause,
    handleSend: () => void handleSend(0),
    handleCancel,
    handleVoiceChanged,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    setIsPlaying,
    setPlaybackProgress,
    setCurrentTime,
  };
}
