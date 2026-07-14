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

  const recognitionRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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

      recognitionRef.current.onresult = (event: any) => {
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

      recognitionRef.current.onerror = (event: any) => {
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

export function useTextToSpeechManagement(text: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((textToSpeak?: string) => {
    const textContent = textToSpeak || text;
    if (!textContent) return;

    try {
      const utterance = new SpeechSynthesisUtterance(textContent);
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = (event) => setError(event.error);

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Speech synthesis error';
      setError(message);
      log.error('Text to speech error:', err);
    }
  }, [text]);

  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  return { isPlaying, error, speak, stop };
}

export function useVoiceAgentManagement() {
  const [isActive, setIsActive] = useState(false);
  const [responses, setResponses] = useState<string[]>([]);

  const activate = useCallback(() => {
    setIsActive(true);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
  }, []);

  return { isActive, responses, activate, deactivate };
}

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

export type { VoiceState };
