// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useTalkXManagement } from '@/hooks/useIntegrationManagement';

export function useTalkX() {
  return useTalkXManagement();
}
