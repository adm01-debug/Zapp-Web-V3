// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactEnrichedDataManagement } from '@/hooks/useCRMManagement';

export function useContactEnrichedData(contactId: string) {
  return useContactEnrichedDataManagement(contactId);
}
