// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useRealtimeSentimentAlertsManagement } from '@/hooks/useAlertManagement';

export function useRealtimeSentimentAlerts() {
  useRealtimeSentimentAlertsManagement();
  return null;
}
