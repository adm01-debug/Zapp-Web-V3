// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useTextToSpeechManagement } from '@/hooks/useVoiceManagement';

/** Converts text to speech audio output with language support. */
export function useTextToSpeech(text?: string) {
  return useTextToSpeechManagement(text);
}
