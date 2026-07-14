// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useMessageAttemptsManagement } from '@/hooks/useAnalyticsManagement';

/** Tracks message send attempts and delivery status for analytics. */
export function useMessageAttempts(messageId: string) {
  return useMessageAttemptsManagement(messageId);
}
