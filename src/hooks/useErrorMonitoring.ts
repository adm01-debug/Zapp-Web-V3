// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useErrorMonitoringManagement } from '@/hooks/useAnalyticsManagement';

/** Monitors and tracks error rates and system health metrics. */
export function useErrorRateMonitoring() {
  return useErrorMonitoringManagement();
}
