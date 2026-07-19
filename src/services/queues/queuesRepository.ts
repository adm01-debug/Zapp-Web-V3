/**
 * Queues Repository
 */

import { createService } from '@/services/api/genericService';
import type { QueryParams } from '@/services/api/types';

export interface Queue {
  id: string;
  name: string;
  description?: string;
  account_id: string;
  status: 'active' | 'paused' | 'archived' | 'inactive';
  color?: string;
  icon?: string;
  position?: number;
  created_at: string;
  updated_at: string;
}

const queuesBaseService = createService<Queue>('queues');

/** queues Repository constant. */
export const queuesRepository = {
  list: (filters?: Partial<Queue> & QueryParams) => queuesBaseService.list(filters),

  get: (id: string) => queuesBaseService.get(id),

  search: (query: string) => queuesBaseService.search(query),

  create: (data: Partial<Queue>) => queuesBaseService.create(data),

  update: (id: string, updates: Partial<Queue>) => queuesBaseService.update(id, updates),

  delete: (id: string) => queuesBaseService.delete(id),

  subscribe: (callback: (queue: Queue) => void) => queuesBaseService.subscribe(callback),
};
