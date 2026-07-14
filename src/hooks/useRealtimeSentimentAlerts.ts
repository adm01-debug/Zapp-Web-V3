// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useRealtimeSentimentAlertsManagement } from '@/hooks/useAlertManagement';

/** Streams real-time sentiment analysis alerts and notifications. */
export function useRealtimeSentimentAlerts() {
  useRealtimeSentimentAlertsManagement();
  return null;
}
