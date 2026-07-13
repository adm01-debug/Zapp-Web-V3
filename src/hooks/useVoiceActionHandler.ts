// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useVoiceActionHandlerManagement } from '@/hooks/useVoiceManagement';

export function useVoiceActionHandler(onViewChange?: (viewId: string) => void) {
  return useVoiceActionHandlerManagement();
}
