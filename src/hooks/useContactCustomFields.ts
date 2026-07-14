// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactCustomFieldsManagement } from '@/hooks/useCRMManagement';

export function useContactCustomFields(contactId: string) {
  return useContactCustomFieldsManagement(contactId);
}
