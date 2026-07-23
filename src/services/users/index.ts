/**
 * Users Service Index
 *
 * Centralized exports for users service layer.
 */

// Repository
export { usersRepository, type User, type Agent } from './usersRepository';

// Service
export { usersService } from './usersService';

// Query Hooks
/** Re-exported module members. */
export {
  useUsersList,
  useUser,
  useSearchUsers,
  useAgentsList,
  useAgent,
  useSearchAgents,
  useAgentsByStatus,
  useOnlineAgents,
  useCurrentUser,
  useInvalidateUsers,
} from './useUsersQueries';

// Mutation Hooks
/** Re-exported module members. */
export {
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
} from './useUsersMutations';
