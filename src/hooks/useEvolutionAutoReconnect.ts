// Re-export from consolidated useIntegrationAuthenticationManagement module (ETAPA 47 consolidation)
import { useEvolutionAutoReconnectManagement } from '@/hooks/useIntegrationAuthenticationManagement';

export function useEvolutionAutoReconnect(instanceName?: string) {
  return useEvolutionAutoReconnectManagement(instanceName);
}
