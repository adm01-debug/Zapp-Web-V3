// Re-export from consolidated useUtilityHelpersManagement module (ETAPA 49 consolidation)
import { useUndoableActionManagement } from '@/hooks/useUtilityHelpersManagement';

export function useUndoableAction() {
  return useUndoableActionManagement();
}
