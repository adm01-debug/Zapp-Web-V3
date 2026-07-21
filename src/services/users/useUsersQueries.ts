// @ts-nocheck
/**
 * Users Queries Hook
 *
 * Hooks for users/agents data fetching.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useListQuery, useDetailQuery, useSearchQuery, queryKeys } from '@/services/api';
import { usersService, type User, type Agent } from './index';
import type { QueryParams } from '@/services/api/types';

/**
 * Hook to list all users
 */
export const useUsersList = (filters?: Partial<User> & QueryParams) => {
  return useListQuery(queryKeys.users.userList(filters), () => usersService.listUsers(filters), {
    staleTime: 30_000,
    enabled: true,
  });
};

/**
 * Hook to get a single user by ID
 */
export const useUser = (id?: string) => {
  return useDetailQuery(
    queryKeys.users.detail(id || ''),
    () => usersService.getUser(id ?? ''),
    !!id,
    {
      staleTime: 60_000,
    }
  );
};

/**
 * Hook to search users
 */
export const useSearchUsers = (query?: string) => {
  return useSearchQuery(
    queryKeys.users.searchUsers(query),
    () => usersService.searchUsers(query || ''),
    !!query && query.length >= 2,
    {
      staleTime: 10_000,
    }
  );
};

/**
 * Hook to list all agents
 */
export const useAgentsList = (filters?: Partial<Agent> & QueryParams) => {
  return useListQuery(queryKeys.users.agentList(filters), () => usersService.listAgents(filters), {
    staleTime: 30_000,
    enabled: true,
  });
};

/**
 * Hook to get a single agent by ID
 */
export const useAgent = (id?: string) => {
  return useDetailQuery(
    queryKeys.users.detail(id || ''),
    () => usersService.getAgent(id ?? ''),
    !!id,
    {
      staleTime: 60_000,
    }
  );
};

/**
 * Hook to search agents
 */
export const useSearchAgents = (query?: string) => {
  return useSearchQuery(
    queryKeys.users.searchAgents(query),
    () => usersService.searchAgents(query || ''),
    !!query && query.length >= 2,
    {
      staleTime: 10_000,
    }
  );
};

/**
 * Hook to get agents by status
 */
export const useAgentsByStatus = (status: Agent['status'], params?: Partial<QueryParams>) => {
  return useQuery({
    queryKey: queryKeys.users.byStatus(status),
    queryFn: () => usersService.getAgentsByStatus(status, params),
    staleTime: 15_000,
  });
};

/**
 * Hook to get online agents
 */
export const useOnlineAgents = () => {
  return useQuery({
    queryKey: queryKeys.users.online(),
    queryFn: () => usersService.getAgentsByStatus('available'),
    staleTime: 5_000, // More frequent updates for online status
  });
};

/**
 * Hook to get current user
 */
export const useCurrentUser = () => {
  return useQuery({
    queryKey: queryKeys.users.me(),
    queryFn: () => usersService.getCurrentUser(),
    staleTime: 60_000,
  });
};

/**
 * Hook to invalidate users queries
 */
export const useInvalidateUsers = () => {
  const queryClient = useQueryClient();

  return {
    invalidateList: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });
    },
    invalidateDetail: (id: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
  };
};
