// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useBitrixApiManagement } from '@/hooks/useIntegrationManagement';

export function useBitrixApi() {
  return useBitrixApiManagement();
}
