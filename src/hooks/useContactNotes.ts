// Re-export from consolidated useCRMManagement module (ETAPA 43 consolidation)
import { useContactNotesManagement } from '@/hooks/useCRMManagement';

export function useContactNotes(contactId: string) {
  return useContactNotesManagement(contactId);
}
