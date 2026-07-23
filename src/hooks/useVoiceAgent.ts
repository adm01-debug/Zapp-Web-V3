// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useVoiceAgentManagement } from '@/hooks/useVoiceManagement';

/** Hook: use Voice Agent. */
export function useVoiceAgent() {
  return useVoiceAgentManagement();
}

export type { VoiceAgentAction } from '@/features/inbox/hooks/voice/types';
