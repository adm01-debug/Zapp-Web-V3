// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useErrorMonitoringManagement } from '@/hooks/useAnalyticsManagement';

/** Hook: use Error Rate Monitoring. */
export function useErrorRateMonitoring() {
  return useErrorMonitoringManagement();
}
