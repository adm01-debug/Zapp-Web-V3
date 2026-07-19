// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useLatestAnalysisManagement } from '@/hooks/useAnalyticsManagement';

/** React hook: use Latest Analysis. */
export function useLatestAnalysis(timeWindow: number) {
  return useLatestAnalysisManagement(timeWindow);
}
