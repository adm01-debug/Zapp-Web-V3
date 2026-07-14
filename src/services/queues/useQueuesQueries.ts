// @ts-nocheck
/**
 * Queues Queries Hooks
 */

import { useQueryClient } from '@tanstack/react-query';
import {
  createListQuery,
  createDetailQuery,
  createSearchQuery,
  queryKeys,
} from '@/services/api';
import { queuesService, type Queue } from './index';
import type { QueryParams } from '@/services/api/types';

export const useQueuesList = (filters?: Partial<Queue> & QueryParams) => {
  return createListQuery(
    queryKeys.queues.list(filters),
    () => queuesService.list(filters),
    { staleTime: 30_000 }
  );
};

export const useQueue = (id?: string) => {
  return createDetailQuery(
    queryKeys.queues.detail(id || ''),
    () => queuesService.get(id!),
    !!id,
    { staleTime: 60_000 }
  );
};

export const useSearchQueues = (query?: string) => {
  return createSearchQuery(
    queryKeys.queues.search(query),
    () => queuesService.search(query || ''),
    !!query && query.length >= 2,
    { staleTime: 10_000 }
  );
};

export const useInvalidateQueues = () => {
  const queryClient = useQueryClient();
  return {
    invalidateList: () => queryClient.invalidateQueries({ queryKey: queryKeys.queues.lists() }),
    invalidateDetail: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.queues.detail(id) }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.queues.all() }),
  };
};
