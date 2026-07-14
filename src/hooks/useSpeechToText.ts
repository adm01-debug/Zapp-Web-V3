// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useSpeechToTextManagement } from '@/hooks/useVoiceManagement';

interface SpeechToTextOptions {
  language?: string;
  continuous?: boolean;
  onResult?: (text: string) => void;
}

interface SpeechToTextCompatResult {
  isListening: boolean;
  transcript: string;
  isFinal?: boolean;
  interim?: string;
  error?: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript?: () => void;
  isSupported: boolean;
  toggleListening: () => void;
}

export function useSpeechToText(options: SpeechToTextOptions = {}): SpeechToTextCompatResult {
  const speech = useSpeechToTextManagement(options.language);

  const toggleListening = () => {
    if (speech.isListening) {
      speech.stopListening();
      if (speech.transcript.trim()) options.onResult?.(speech.transcript.trim());
    } else {
      speech.resetTranscript();
      speech.startListening();
    }
  };

  return {
    ...speech,
    isSupported: typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
    toggleListening,
  };
}
