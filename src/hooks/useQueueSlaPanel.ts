// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueueSlaManagement } from '@/hooks/useQueueManagement';
import type {
  QueueSlaFilters,
  QueueSlaPatch,
  QueueSlaRow,
  SlaStatusFilter,
  RebalanceRunInfo,
} from '@/hooks/useQueueManagement';

/** Re-exported module members. */
export type { QueueSlaFilters, QueueSlaPatch, QueueSlaRow, SlaStatusFilter, RebalanceRunInfo };

/** Hook: use Queue Sla Panel. */
export function useQueueSlaPanel(filters: QueueSlaFilters) {
  return useQueueSlaManagement({ filters });
}
