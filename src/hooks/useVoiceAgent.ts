// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useVoiceAgentManagement } from '@/hooks/useVoiceManagement';

export function useVoiceAgent() {
  return useVoiceAgentManagement();
}
