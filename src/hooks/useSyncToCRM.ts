// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useSyncToCRMManagement } from '@/hooks/useIntegrationManagement';

/** Synchronizes data with external CRM systems for entity integration. */
export function useSyncToCRM(entityId?: string) {
  return useSyncToCRMManagement(entityId);
}
