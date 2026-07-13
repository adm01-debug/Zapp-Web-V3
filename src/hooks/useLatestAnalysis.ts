// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useLatestAnalysisManagement } from '@/hooks/useAnalyticsManagement';

export function useLatestAnalysis(timeWindow: number) {
  return useLatestAnalysisManagement(timeWindow);
}
