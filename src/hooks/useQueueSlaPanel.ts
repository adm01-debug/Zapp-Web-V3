// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueueSlaManagement } from '@/hooks/useQueueManagement';
import type { QueueSlaFilters, QueueSlaPatch, QueueSlaRow, SlaStatusFilter } from '@/hooks/useQueueManagement';

export type { QueueSlaFilters, QueueSlaPatch, QueueSlaRow, SlaStatusFilter };

/** Hook: use Queue Sla Panel. */
export function useQueueSlaPanel(filters: QueueSlaFilters) {
  return useQueueSlaManagement({ filters });
}
