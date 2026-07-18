import { useState, useCallback } from 'react';

const DEFAULT_VOICE_ID = 'TY3h8ANhQUsJaa0Bga5F';
const DEFAULT_SPEED = 1.0;
const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

interface UseTextToSpeechOptions {
  initialVoiceId?: string;
  initialSpeed?: number;
  onVoiceChange?: (voiceId: string) => void;
  onSpeedChange?: (speed: number) => void;
}

export function useTextToSpeech(options: UseTextToSpeechOptions = {}) {
  const {
    initialVoiceId = DEFAULT_VOICE_ID,
    initialSpeed = DEFAULT_SPEED,
    onVoiceChange,
    onSpeedChange,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [voiceId, setVoiceIdState] = useState(initialVoiceId);
  const [speed, setSpeedState] = useState(initialSpeed);

  const speak = useCallback(
    async (text: string, messageId?: string) => {
      if (!text) return;
      setIsLoading(true);
      setCurrentMessageId(messageId ?? null);
      try {
        setIsPlaying(true);
      } finally {
        setIsLoading(false);
      }
    },
    [voiceId, speed]
  );

  const stop = useCallback(() => {
    setIsPlaying(false);
    setCurrentMessageId(null);
  }, []);

  const setVoiceId = useCallback(
    (id: string) => {
      setVoiceIdState(id);
      onVoiceChange?.(id);
    },
    [onVoiceChange]
  );

  const setSpeed = useCallback(
    (s: number) => {
      const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));
      setSpeedState(clamped);
      onSpeedChange?.(clamped);
    },
    [onSpeedChange]
  );

  return {
    isLoading,
    isPlaying,
    currentMessageId,
    voiceId,
    speed,
    speak,
    stop,
    setVoiceId,
    setSpeed,
  };
}
