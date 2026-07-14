// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactIntelligenceManagement } from '@/hooks/useCRMManagement';

/** Provides contact sentiment, engagement, and risk intelligence analytics. */
export function useContactIntelligence(contactId: string) {
  return useContactIntelligenceManagement(contactId);
}
