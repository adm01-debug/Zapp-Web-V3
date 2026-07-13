// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useSearchInsightsManagement, type SearchInsights, type SearchInsightsTopQuery, type SearchInsightsZeroResult } from '@/hooks/useSearchManagement';

export type { SearchInsights, SearchInsightsTopQuery, SearchInsightsZeroResult };

export function useSearchInsights(days: number) {
  return useSearchInsightsManagement(days);
}
