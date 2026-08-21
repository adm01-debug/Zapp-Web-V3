import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from '@/lib/logger';

export interface UseTextToSpeechOptions {
  initialVoiceId?: string;
  initialSpeed?: number;
  onVoiceChange?: (voiceId: string) => void;
  onSpeedChange?: (speed: number) => void;
}

export interface UseTextToSpeechResult {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  currentMessageId: string | null;
  voiceId: string;
  setVoiceId: (voiceId: string) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  speak: (textToSpeak?: string, messageId?: string) => void;
  stop: () => void;
}

/**
 * Text-to-speech hook based on the Web Speech API.
 *
 * Accepts either a default text (legacy signature) or an options object with
 * voice/speed preferences persisted by the caller.
 */
export function useTextToSpeech(
  textOrOptions?: string | UseTextToSpeechOptions
): UseTextToSpeechResult {
  const options: UseTextToSpeechOptions =
    typeof textOrOptions === 'string' || textOrOptions == null ? {} : textOrOptions;
  const defaultText = typeof textOrOptions === 'string' ? textOrOptions : '';

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [voiceId, setVoiceIdState] = useState<string>(options.initialVoiceId ?? '');
  const [speed, setSpeedState] = useState<number>(options.initialSpeed ?? 1);

  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Etapa 33: re-sincroniza quando as preferências resolvem ASYNC — o
  // useState acima congela o valor do 1º render; sem estes effects o seletor
  // ficava preso no default quando settings chegavam depois do mount.
  // setState com valor idêntico não re-renderiza; escolha manual posterior do
  // usuário atualiza a própria setting via onVoiceChange/onSpeedChange, então
  // não há sobrescrita da escolha nem loop.
  const { initialVoiceId, initialSpeed } = options;
  useEffect(() => {
    if (initialVoiceId !== undefined) setVoiceIdState(initialVoiceId);
  }, [initialVoiceId]);
  useEffect(() => {
    if (initialSpeed !== undefined) setSpeedState(initialSpeed);
  }, [initialSpeed]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
    };
  }, []);

  const setVoiceId = useCallback((next: string) => {
    setVoiceIdState(next);
    optionsRef.current.onVoiceChange?.(next);
  }, []);

  const setSpeed = useCallback((next: number) => {
    setSpeedState(next);
    optionsRef.current.onSpeedChange?.(next);
  }, []);

  const speak = useCallback(
    (textToSpeak?: string, messageId?: string) => {
      const content = textToSpeak || defaultText;
      if (!content) return;

      const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      if (!synth) {
        setError('Speech synthesis not supported');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        setCurrentMessageId(messageId ?? null);
        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(content);
        utterance.rate = speed || 1;
        if (voiceId) {
          const match = synth.getVoices().find((v) => v.voiceURI === voiceId || v.name === voiceId);
          if (match) utterance.voice = match;
        }
        utterance.onstart = () => {
          if (!mountedRef.current) return;
          setIsLoading(false);
          setIsPlaying(true);
        };
        utterance.onend = () => {
          if (!mountedRef.current) return;
          setIsLoading(false);
          setIsPlaying(false);
          setCurrentMessageId(null);
        };
        utterance.onerror = (event) => {
          if (!mountedRef.current) return;
          setIsLoading(false);
          setIsPlaying(false);
          setCurrentMessageId(null);
          setError(event.error ?? 'Speech synthesis error');
        };

        synth.speak(utterance);
      } catch (err) {
        setIsLoading(false);
        setIsPlaying(false);
        setCurrentMessageId(null);
        setError(err instanceof Error ? err.message : 'Speech synthesis error');
        log.error('Text to speech error:', err);
      }
    },
    [defaultText, speed, voiceId]
  );

  const stop = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
    setIsPlaying(false);
    setIsLoading(false);
    setCurrentMessageId(null);
  }, []);

  return {
    isPlaying,
    isLoading,
    error,
    currentMessageId,
    voiceId,
    setVoiceId,
    speed,
    setSpeed,
    speak,
    stop,
  };
}
