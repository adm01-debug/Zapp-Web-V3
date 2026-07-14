// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueuesCrudManagement } from '@/hooks/useQueueManagement';
import type { Queue, QueueMember, QueueWithMembers } from '@/hooks/useQueueManagement';

export type { Queue, QueueMember, QueueWithMembers };

export function useQueues() {
  return useQueuesCrudManagement();
}
