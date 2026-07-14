// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueuesComparisonManagement } from '@/hooks/useQueueManagement';
import type { DateRange } from '@/hooks/useQueueManagement';

export type { DateRange };

export function useQueuesComparison(dateRange: DateRange) {
  return useQueuesComparisonManagement({ dateRange });
}
