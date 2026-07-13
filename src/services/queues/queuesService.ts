/**
 * Queues Service
 */

import { queuesRepository, type Queue } from './queuesRepository';
import type { ListResponse, QueryParams } from '@/services/api/types';

export const queuesService = {
  list: async (filters?: Partial<Queue> & QueryParams): Promise<ListResponse<Queue>> => {
    return queuesRepository.list(filters);
  },

  get: async (id: string): Promise<Queue | null> => {
    if (!id) throw new Error('Queue ID is required');
    return queuesRepository.get(id);
  },

  search: async (query: string): Promise<Queue[]> => {
    if (!query || query.length < 2) return [];
    return queuesRepository.search(query.toLowerCase());
  },

  create: async (data: Partial<Queue>): Promise<Queue> => {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Queue name is required');
    }
    if (!data.account_id) {
      throw new Error('Account ID is required');
    }

    return queuesRepository.create({
      ...data,
      name: data.name.trim(),
      status: 'active',
    });
  },

  update: async (id: string, updates: Partial<Queue>): Promise<Queue> => {
    if (!id) throw new Error('Queue ID is required');

    if (updates.name && updates.name.trim().length === 0) {
      throw new Error('Queue name cannot be empty');
    }

    return queuesRepository.update(id, {
      ...updates,
      name: updates.name?.trim(),
    });
  },

  delete: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('Queue ID is required');
    return queuesRepository.delete(id);
  },

  onQueueChange: (callback: (queue: Queue) => void) => {
    return queuesRepository.subscribe(callback);
  },
};
