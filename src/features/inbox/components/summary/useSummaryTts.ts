import { useState, useRef, useEffect, useCallback } from 'react';
import { playTtsAudio, type TtsPlayback, type PlayTtsOptions } from '@/features/inbox';
import { toast } from 'sonner';

export function useSummaryTts(contactId?: string) {
  const ttsRef = useRef<TtsPlayback | null>(null);
  const mountedRef = useRef(true);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [lastTtsText, setLastTtsText] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      ttsRef.current?.stop();
      ttsRef.current = null;
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    ttsRef.current?.stop();
    ttsRef.current = null;
    setIsTtsPlaying(false);
    setIsTtsLoading(false);
    setAutoplayBlocked(false);
  }, [contactId]);

  const startTtsPlayback = useCallback(
    (text: string) => {
      if (isTtsPlaying) {
        ttsRef.current?.stop();
        ttsRef.current = null;
        setIsTtsPlaying(false);
        setIsTtsLoading(false);
        return;
      }
      if (!text.trim()) return;

      setAutoplayBlocked(false);
      setLastTtsText(text);

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

      const playback = playTtsAudio(
        text,
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ttsOptions
      );
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
    [isTtsPlaying]
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
    lastTtsText,
    startTtsPlayback,
    handleRetryAutoplay,
    handleDismissAutoplayWarning,
  };
}
