import { useTextToSpeechManagement } from '@/hooks/useVoiceManagement';

/** Hook: use Text To Speech. */
export function useTextToSpeech(text?: string) {
  return useTextToSpeechManagement(text ?? '');
}
