// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useLatestAnalysisManagement } from '@/hooks/useAnalyticsManagement';

/** Retrieves the latest analysis data within a specified time window. */
export function useLatestAnalysis(timeWindow: number) {
  return useLatestAnalysisManagement(timeWindow);
}
