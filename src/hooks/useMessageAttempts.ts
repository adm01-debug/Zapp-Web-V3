// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useMessageAttemptsManagement } from '@/hooks/useAnalyticsManagement';

export function useMessageAttempts(messageId: string) {
  return useMessageAttemptsManagement(messageId);
}
