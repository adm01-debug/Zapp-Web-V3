// Re-export from consolidated useUIManagement module (ETAPA 31 consolidation)
import { useZenModeManagement } from '@/hooks/useUIManagement';

export function useZenMode() {
  return useZenModeManagement();
}