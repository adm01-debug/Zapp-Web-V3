// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactIntelligenceManagement } from '@/hooks/useCRMManagement';

export function useContactIntelligence(contactId: string) {
  return useContactIntelligenceManagement(contactId);
}
