// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueueAnalyticsManagement } from '@/hooks/useQueueManagement';
import type { DateRange } from '@/hooks/useQueueManagement';

export type { DateRange };

export function useQueueAnalytics(queueId: string, dateRange: DateRange) {
  return useQueueAnalyticsManagement({ queueId, dateRange });
}
