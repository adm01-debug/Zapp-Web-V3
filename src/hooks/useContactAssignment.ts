// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactAssignmentManagement } from '@/hooks/useCRMManagement';

/** Hook: use Contact Assignment. */
export function useContactAssignment(contactId: string) {
  return useContactAssignmentManagement(contactId);
}
