// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueueSlaManagement } from '@/hooks/useQueueManagement';
import type { QueueSlaRow } from '@/hooks/useQueueManagement';

export type { QueueSlaRow };

interface QueueSlaFilters {
  skill_name: string | null;
  channel_type: string | null;
  sla_status: 'on_track' | 'at_risk' | 'breached' | null;
}

export function useQueueSlaPanel(filters: QueueSlaFilters) {
  return useQueueSlaManagement({ filters });
}
