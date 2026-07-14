// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useSyncToCRMManagement } from '@/hooks/useIntegrationManagement';

export function useSyncToCRM(entityId?: string) {
  return useSyncToCRMManagement(entityId);
}
