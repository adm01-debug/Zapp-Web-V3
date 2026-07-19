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
      if (!text || typeof speechSynthesis === 'undefined') return;
      speechSynthesis.cancel();
      setIsLoading(true);
      setCurrentMessageId(messageId ?? null);
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speed;
        const voices = speechSynthesis.getVoices();
        const matched = voices.find((v) => v.voiceURI === voiceId || v.name === voiceId);
        if (matched) utterance.voice = matched;
        utterance.onstart = () => { setIsPlaying(true); setIsLoading(false); };
        utterance.onend = () => { setIsPlaying(false); setCurrentMessageId(null); };
        utterance.onerror = () => { setIsPlaying(false); setIsLoading(false); setCurrentMessageId(null); };
        speechSynthesis.speak(utterance);
      } catch {
        setIsLoading(false);
      }
    },
    [voiceId, speed]
  );

  const stop = useCallback(() => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
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
