import { useState, useRef, useCallback, useEffect } from 'react';
import { playTtsAudio, type TtsPlayback, type PlayTtsOptions } from '@/features/inbox';
import { toast } from 'sonner';

export function useAnalysisTts() {
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [lastTtsText, setLastTtsText] = useState<string | null>(null);
  const ttsRef = useRef<TtsPlayback | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      ttsRef.current?.stop();
      mountedRef.current = false;
    };
  }, []);

  const stopTts = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.stop();
      ttsRef.current = null;
      setIsTtsPlaying(false);
      setIsTtsLoading(false);
    }
  }, []);

  const startTtsPlayback = useCallback(
    (text: string) => {
      if (isTtsPlaying && ttsRef.current) {
        stopTts();
        return;
      }
      if (!text.trim()) return;

      setAutoplayBlocked(false);
      setLastTtsText(text);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const ttsOptions: PlayTtsOptions = {
        onLoadingChange: setIsTtsLoading,
        onError: (err) => {
          if (err.message === 'AUTOPLAY_BLOCKED') return;
          toast.error('Erro ao gerar áudio: ' + err.message);
        },
        onAutoplayBlocked: () => {
          setAutoplayBlocked(true);
          setIsTtsPlaying(false);
          setIsTtsLoading(false);
        },
      };

      const playback = playTtsAudio(text, supabaseUrl, supabaseKey, ttsOptions);
      ttsRef.current = playback;
      setIsTtsPlaying(true);

      playback.promise
        .then(() => {
          if (mountedRef.current) {
            setIsTtsPlaying(false);
          }
        })
        .catch(() => {
          if (mountedRef.current) {
            setIsTtsPlaying(false);
          }
        });
    },
    [isTtsPlaying, stopTts]
  );

  const handleRetryAutoplay = useCallback(() => {
    if (lastTtsText) {
      setAutoplayBlocked(false);
      startTtsPlayback(lastTtsText);
    }
  }, [lastTtsText, startTtsPlayback]);

  const handleDismissAutoplayWarning = useCallback(() => {
    setAutoplayBlocked(false);
    setLastTtsText(null);
  }, []);

  return {
    isTtsPlaying,
    isTtsLoading,
    autoplayBlocked,
    stopTts,
    startTtsPlayback,
    handleRetryAutoplay,
    handleDismissAutoplayWarning,
  };
}
