// Re-export from consolidated useAnalyticsMonitoringManagement module (ETAPA 48 consolidation)
import { useDemandPredictionManagement, PredictionPoint, DemandInsights } from '@/hooks/useAnalyticsMonitoringManagement';

export { PredictionPoint, DemandInsights };

export function useDemandPrediction(externalData?: PredictionPoint[], currentCapacity = 35) {
  return useDemandPredictionManagement(externalData, currentCapacity);
}
