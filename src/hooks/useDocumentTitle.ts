// Re-export from consolidated useUtilityHelpersManagement module (ETAPA 49 consolidation)
import { useDocumentTitleManagement } from '@/hooks/useUtilityHelpersManagement';

export function useDocumentTitle(title?: string) {
  useDocumentTitleManagement(title);
}
