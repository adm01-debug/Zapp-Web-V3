// Re-export from consolidated useAdvancedFeaturesManagement module (ETAPA 50 consolidation)
import { useServiceWorkerManagement } from '@/hooks/useAdvancedFeaturesManagement';

export function useServiceWorker() {
  return useServiceWorkerManagement();
}
