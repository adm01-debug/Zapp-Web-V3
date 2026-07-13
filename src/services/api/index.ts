/**
 * API Services Index
 *
 * Centralized exports for all API-related utilities.
 * This includes query/mutation factories, query keys, and error handling.
 */

export { queryKeys } from './queryKeys';
export {
  createListQuery,
  createDetailQuery,
  createSearchQuery,
  createRealtimeQuery,
  createPaginatedQuery,
  createInfiniteQuery,
  handleQueryError,
  retryConfig,
} from './queryFactory';

export {
  createCreateMutation,
  createUpdateMutation,
  createDeleteMutation,
  createBulkMutation,
  createAsyncMutation,
  handleMutationError,
} from './mutationFactory';

export type { SupabaseError } from './types';
