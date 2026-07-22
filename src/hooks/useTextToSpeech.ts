import { useState, useCallback } from 'react';
import { useTextToSpeechManagement } from '@/hooks/useVoiceManagement';

interface UseTextToSpeechOptions {
  initialVoiceId?: string;
  initialSpeed?: number;
  onVoiceChange?: (v: string) => void;
  onSpeedChange?: (s: number) => void;
}

/** Hook: use Text To Speech. Wraps management hook with UI-level voice/speed state. */
export function useTextToSpeech(textOrOptions?: string | UseTextToSpeechOptions) {
  const isString = typeof textOrOptions === 'string';
  const opts: UseTextToSpeechOptions = isString ? {} : (textOrOptions ?? {});
  const text = isString ? textOrOptions : '';

  const base = useTextToSpeechManagement(text);

  const [voiceId, setVoiceIdState] = useState<string>(opts.initialVoiceId ?? '');
  const [speed, setSpeedState] = useState<number>(opts.initialSpeed ?? 1);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);

  const setVoiceId = useCallback(
    (v: string) => {
      setVoiceIdState(v);
      opts.onVoiceChange?.(v);
    },
    [opts]
  );
  const setSpeed = useCallback(
    (s: number) => {
      setSpeedState(s);
      opts.onSpeedChange?.(s);
    },
    [opts]
  );

  return {
    ...base,
    isLoading: false,
    voiceId,
    setVoiceId,
    speed,
    setSpeed,
    currentMessageId,
    setCurrentMessageId,
  };
}
