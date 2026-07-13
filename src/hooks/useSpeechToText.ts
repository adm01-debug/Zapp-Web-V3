// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useSpeechToTextManagement } from '@/hooks/useVoiceManagement';

export function useSpeechToText(options: any = {}) {
  return useSpeechToTextManagement(options.language);
}
