// @ts-nocheck
// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useTextToSpeechManagement } from '@/hooks/useVoiceManagement';

export function useTextToSpeech(text?: string) {
  return useTextToSpeechManagement(text);
}