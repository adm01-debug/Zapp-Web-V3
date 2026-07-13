// Re-export from consolidated useAnalyticsMonitoringManagement module (ETAPA 48 consolidation)
import { useNPSSurveysManagement, NPSSurvey } from '@/hooks/useAnalyticsMonitoringManagement';

export { NPSSurvey };

export function useNPSSurveys() {
  return useNPSSurveysManagement();
}
