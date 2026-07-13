// Re-export from consolidated useIntegrationAuthenticationManagement module (ETAPA 47 consolidation)
import { useWebAuthnManagement } from '@/hooks/useIntegrationAuthenticationManagement';

export function useWebAuthn() {
  return useWebAuthnManagement();
}
