// Re-export from consolidated useUIManagement module (ETAPA 31 consolidation)
import { useZenModeManagement } from '@/hooks/useUIManagement';

/** Manages zen mode for distraction-free viewing with persistent state. */
export function useZenMode() {
  return useZenModeManagement();
}