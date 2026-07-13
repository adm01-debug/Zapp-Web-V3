// Re-export from consolidated useUtilityHelpersManagement module (ETAPA 49 consolidation)
import { useMountedRefManagement } from '@/hooks/useUtilityHelpersManagement';

export function useMountedRef() {
  return useMountedRefManagement();
}
