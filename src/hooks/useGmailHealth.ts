// Re-export from consolidated useIntegrationAuthenticationManagement module (ETAPA 47 consolidation)
import { useEmailHealthManagement } from '@/hooks/useIntegrationAuthenticationManagement';

export function useEmailHealth() {
  return useEmailHealthManagement();
}
