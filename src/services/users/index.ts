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
export {
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
} from './useUsersMutations';
