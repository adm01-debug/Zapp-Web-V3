// Re-export from consolidated useQueueManagement module (ETAPA 26 consolidation)
import { useQueuesCrudManagement } from '@/hooks/useQueueManagement';
import type { Queue, QueueMember, QueueWithMembers } from '@/hooks/useQueueManagement';

export type { Queue, QueueMember, QueueWithMembers };

/** Provides CRUD operations and management for queue data and members. */
export function useQueues() {
  return useQueuesCrudManagement();
}
