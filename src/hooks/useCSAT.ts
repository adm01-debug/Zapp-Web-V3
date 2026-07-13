// Re-export from consolidated useAnalyticsMonitoringManagement module (ETAPA 48 consolidation)
import { useCSATManagement, CSATSurvey, CSATStats } from '@/hooks/useAnalyticsMonitoringManagement';

export { CSATSurvey, CSATStats };

export function useCSAT(period: 'today' | 'week' | 'month' = 'month') {
  return useCSATManagement(period);
}
