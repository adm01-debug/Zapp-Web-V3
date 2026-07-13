// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueueGoalsManagement } from '@/hooks/useQueueManagement';
import type { QueueGoal } from '@/hooks/useQueueManagement';

export type { QueueGoal };

export function useQueueGoals() {
  return useQueueGoalsManagement();
}
