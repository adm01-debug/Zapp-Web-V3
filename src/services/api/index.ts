/**
 * API Services Index
 *
 * Centralized exports for all API-related utilities.
 * This includes query/mutation factories, query keys, and error handling.
 */

export { queryKeys } from './queryKeys';
export {
  useListQuery,
  useDetailQuery,
  useSearchQuery,
  useRealtimeQuery,
  usePaginatedQuery,
  useInfiniteQueryStub,
  handleQueryError,
  retryConfig,
} from './queryFactory';

/** Re-exported module members. */
export {
  useCreateMutation,
  useUpdateMutation,
  useDeleteMutation,
  useBulkMutation,
  useAsyncMutation,
  handleMutationError,
} from './mutationFactory';

/** Re-exported module members. */
export type { SupabaseError } from './types';
