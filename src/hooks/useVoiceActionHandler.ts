// Re-export from consolidated useVoiceManagement module (ETAPA 35 consolidation)
import { useVoiceActionHandlerManagement } from '@/hooks/useVoiceManagement';
import type { VoiceAgentAction } from '@/features/inbox/hooks/voice/types';

export function useVoiceActionHandler(onViewChange?: (viewId: string) => void) {
  const { handleVoiceAction } = useVoiceActionHandlerManagement();

  return (action: VoiceAgentAction) => {
    if (action.action === 'navigate' && action.data?.route) {
      onViewChange?.(action.data.route);
    }
    void handleVoiceAction(action.action);
  };
}
