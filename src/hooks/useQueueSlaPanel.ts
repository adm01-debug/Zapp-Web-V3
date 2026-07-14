// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueueSlaManagement } from '@/hooks/useQueueManagement';
import type { QueueSlaFilters, QueueSlaRow, SlaStatusFilter } from '@/hooks/useQueueManagement';

export type { QueueSlaFilters, QueueSlaRow, SlaStatusFilter };

export function useQueueSlaPanel(filters: QueueSlaFilters) {
  return useQueueSlaManagement({ filters });
}
