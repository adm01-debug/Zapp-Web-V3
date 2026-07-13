// Re-export from consolidated useUtilityHelpersManagement module (ETAPA 49 consolidation)
import { usePrefetchOnHoverManagement } from '@/hooks/useUtilityHelpersManagement';

export function usePrefetchOnHover() {
  return usePrefetchOnHoverManagement();
}
