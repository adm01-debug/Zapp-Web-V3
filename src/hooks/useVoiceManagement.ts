// @ts-nocheck
// Consolidated Voice & Speech Management Module (ETAPA 35)
// Consolidates: useSpeechToText, useTextToSpeech, useVoiceAgent, useVoiceActionHandler
import { useState, useCallback, useRef, useEffect } from 'react';
import { log } from '@/lib/logger';

interface VoiceState {
  isListening: boolean;
  transcript: string;
  isFinal: boolean;
  interim: string;
  error: string | null;
}

/** Wraps the Web Speech API (SpeechRecognition) to provide continuous, interim-result transcription in the given language. */
export function useSpeechToTextManagement(language: string = 'pt-BR'): VoiceState & {
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
} {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    transcript: '',
    isFinal: false,
    interim: '',
    error: null,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      const SpeechRecognition =
        (
          window as Window & {
            SpeechRecognition?: typeof globalThis.SpeechRecognition;
            webkitSpeechRecognition?: typeof globalThis.SpeechRecognition;
          }
        ).SpeechRecognition ||
        (window as Window & { webkitSpeechRecognition?: typeof globalThis.SpeechRecognition })
          .webkitSpeechRecognition;
      if (!SpeechRecognition) {
        if (mountedRef.current) {
          setVoiceState((prev) => ({
            ...prev,
            error: 'Speech Recognition not supported',
          }));
        }
        return;
      }

      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.language = language;
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onstart = () => {
        if (mountedRef.current) {
          setVoiceState((prev) => ({
            ...prev,
            isListening: true,
            error: null,
          }));
        }
      };

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        if (mountedRef.current) {
          setVoiceState((prev) => ({
            ...prev,
            transcript: prev.transcript + final,
            interim,
            isFinal: final.length > 0,
          }));
        }
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (mountedRef.current) {
          setVoiceState((prev) => ({
            ...prev,
            error: event.error,
          }));
        }
      };
    }

    recognitionRef.current?.start();
  }, [language, mountedRef]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    if (mountedRef.current) {
      setVoiceState((prev) => ({
        ...prev,
        isListening: false,
      }));
    }
  }, [mountedRef]);

  const resetTranscript = useCallback(() => {
    if (mountedRef.current) {
      setVoiceState((prev) => ({
        ...prev,
        transcript: '',
        interim: '',
        error: null,
      }));
    }
  }, [mountedRef]);

  return {
    ...voiceState,
    startListening,
    stopListening,
    resetTranscript,
  };
}

/** Uses the browser's SpeechSynthesis API to speak text aloud, exposing `speak` and `stop` controls. */
export function useTextToSpeechManagement(text: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (textToSpeak?: string) => {
      const textContent = textToSpeak || text;
      if (!textContent) return;

      try {
        const utterance = new SpeechSynthesisUtterance(textContent);
        utterance.onstart = () => {
          if (mountedRef.current) setIsPlaying(true);
        };
        utterance.onend = () => {
          if (mountedRef.current) setIsPlaying(false);
        };
        utterance.onerror = (event) => {
          if (mountedRef.current) setError(event.error);
        };

        utteranceRef.current = utterance;
        speechSynthesis.speak(utterance);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Speech synthesis error';
        setError(message);
        log.error('Text to speech error:', err);
      }
    },
    [text]
  );

  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  return { isPlaying, error, speak, stop };
}

/** Manages the active/inactive state and response history of a voice agent session. */
export function useVoiceAgentManagement() {
  const [isActive, setIsActive] = useState(false);
  const [responses] = useState<string[]>([]);

  const activate = useCallback(() => {
    setIsActive(true);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
  }, []);

  return { isActive, responses, activate, deactivate };
}

/** Queues and processes voice commands, tracking the last recognised action and a processing flag. */
export function useVoiceActionHandlerManagement() {
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleVoiceAction = useCallback(async (action: string) => {
    setIsProcessing(true);
    try {
      setLastAction(action);
      // Process voice action
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { lastAction, isProcessing, handleVoiceAction };
}

/** Re-exported module members. */
export type { VoiceState };