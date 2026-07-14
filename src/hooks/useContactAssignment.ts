// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactAssignmentManagement } from '@/hooks/useCRMManagement';

export function useContactAssignment(contactId: string) {
  return useContactAssignmentManagement(contactId);
}
