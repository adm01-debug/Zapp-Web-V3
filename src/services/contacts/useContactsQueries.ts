/**
 * Contacts Queries Hook
 *
 * Hooks for contacts data fetching using standardized patterns.
 * Combines queryFactory with contactsService for DRY code.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useListQuery, useDetailQuery, useSearchQuery, queryKeys } from '@/services/api';
import { contactsService, type Contact } from './index';
import type { QueryParams } from '@/services/api/types';

/**
 * Hook to list all contacts with filtering and pagination
 */
export const useContactsList = (filters?: Partial<Contact> & QueryParams) => {
  return useListQuery(queryKeys.contacts.list(filters), () => contactsService.list(filters), {
    staleTime: 30_000,
    enabled: true,
  });
};

/**
 * Hook to get a single contact by ID
 */
export const useContact = (id?: string) => {
  return useDetailQuery(
    queryKeys.contacts.detail(id || ''),
    () => contactsService.getById(id!),
    !!id,
    {
      staleTime: 60_000,
    }
  );
};

/**
 * Hook to search contacts
 */
export const useContactsSearch = (query?: string) => {
  return useSearchQuery(
    queryKeys.contacts.search(query),
    () => contactsService.search(query || ''),
    !!query && query.length >= 2,
    {
      staleTime: 10_000,
    }
  );
};

/**
 * Hook to get active contacts
 */
export const useActiveContacts = (params?: Partial<QueryParams>) => {
  return useListQuery(queryKeys.contacts.list(params), () => contactsService.getActive(params), {
    staleTime: 30_000,
  });
};

/**
 * Hook to get archived contacts
 */
export const useArchivedContacts = (params?: Partial<QueryParams>) => {
  return useListQuery(queryKeys.contacts.list(params), () => contactsService.getArchived(params), {
    staleTime: 30_000,
  });
};

/**
 * Hook to check if contact exists
 */
export const useContactExists = (id?: string) => {
  return useQuery({
    queryKey: [...queryKeys.contacts.detail(id || ''), 'exists'] as const,
    queryFn: () => contactsService.exists(id!),
    enabled: !!id,
    staleTime: Infinity, // Doesn't change often
  });
};

/**
 * Hook to get total contacts count
 */
export const useContactsTotal = () => {
  return useQuery({
    queryKey: queryKeys.contacts.total(),
    queryFn: () => contactsService.getTotal(),
    staleTime: 60_000,
  });
};

/**
 * Hook to invalidate contacts queries
 * Useful for mutations that need to refresh contacts data
 */
export const useInvalidateContacts = () => {
  const queryClient = useQueryClient();

  return {
    invalidateList: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.searchRoot() });
    },
    invalidateDetail: (id: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(id) });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.searchRoot() });
    },
    invalidateSearch: (query: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.search(query) });
    },
  };
};
