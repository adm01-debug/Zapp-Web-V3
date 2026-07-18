import { useState, useRef, useEffect, useCallback } from 'react';

interface SpeechToTextOptions {
  language?: string;
  continuous?: boolean;
  onResult?: (text: string) => void;
}

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition ||
    null
  );
};

export function useSpeechToText(options: SpeechToTextOptions = {}) {
  const { language = 'pt-BR', continuous = false, onResult } = options;

  const isSupported = !!getSpeechRecognition();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SR();
    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const results = Array.from(event.results);
      const text = results.map((r) => r[0].transcript).join('');
      setTranscript(text);
      const last = results[results.length - 1];
      if (last.isFinal && onResult) {
        onResult(text.trim());
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);

    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  }, [language, continuous, onResult]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  }, [isListening, startListening, stopListening, resetTranscript]);

  return {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    toggleListening,
  };
}
