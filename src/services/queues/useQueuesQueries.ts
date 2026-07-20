/**
 * Queues Queries Hooks
 */

import { useQueryClient } from '@tanstack/react-query';
import { useListQuery, useDetailQuery, useSearchQuery, queryKeys } from '@/services/api';
import { queuesService, type Queue } from './index';
import type { QueryParams } from '@/services/api/types';

/** use Queues List constant. */
export const useQueuesList = (filters?: Partial<Queue> & QueryParams) => {
  return useListQuery(queryKeys.queues.list(filters), () => queuesService.list(filters), {
    staleTime: 30_000,
  });
};

/** use Queue constant. */
export const useQueue = (id?: string) => {
  return useDetailQuery(queryKeys.queues.detail(id || ''), () => queuesService.get(id!), !!id, {
    staleTime: 60_000,
  });
};

/** use Search Queues constant. */
export const useSearchQueues = (query?: string) => {
  return useSearchQuery(
    queryKeys.queues.search(query),
    () => queuesService.search(query || ''),
    !!query && query.length >= 2,
    { staleTime: 10_000 }
  );
};

/** use Invalidate Queues constant. */
export const useInvalidateQueues = () => {
  const queryClient = useQueryClient();
  return {
    invalidateList: () => queryClient.invalidateQueries({ queryKey: queryKeys.queues.lists() }),
    invalidateDetail: (id: string) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.queues.detail(id) }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.queues.all() }),
  };
};
