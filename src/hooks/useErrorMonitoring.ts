// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useErrorMonitoringManagement } from '@/hooks/useAnalyticsManagement';

export function useErrorRateMonitoring() {
  return useErrorMonitoringManagement();
}
