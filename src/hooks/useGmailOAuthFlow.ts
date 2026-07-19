// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useGmailOAuthFlowManagement } from '@/hooks/useIntegrationManagement';

export function useGmailOAuthFlow() {
  return useGmailOAuthFlowManagement();
}
