// @ts-nocheck
/**
 * Connections Queries Hook
 *
 * Hooks for connections data fetching using standardized patterns.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createListQuery,
  createDetailQuery,
  createSearchQuery,
  queryKeys,
} from '@/services/api';
import { connectionsService, type WhatsAppConnection } from './index';
import type { QueryParams } from '@/services/api/types';

/**
 * Hook to list all WhatsApp connections with filtering and pagination
 */
export const useWhatsAppConnectionsList = (filters?: Partial<WhatsAppConnection> & QueryParams) => {
  return createListQuery(
    queryKeys.connections.list(filters),
    () => connectionsService.listWhatsAppConnections(filters),
    {
      staleTime: 30_000,
      enabled: true,
    }
  );
};

/**
 * Hook to get a single WhatsApp connection by ID
 */
export const useWhatsAppConnection = (id?: string) => {
  return createDetailQuery(
    queryKeys.connections.detail(id || ''),
    () => connectionsService.getWhatsAppConnection(id!),
    !!id,
    {
      staleTime: 60_000,
    }
  );
};

/**
 * Hook to search WhatsApp connections
 */
export const useSearchWhatsAppConnections = (query?: string) => {
  return createSearchQuery(
    queryKeys.connections.search(query),
    () => connectionsService.searchWhatsAppConnections(query || ''),
    !!query && query.length >= 2,
    {
      staleTime: 10_000,
    }
  );
};

/**
 * Hook to check connection health status
 */
export const useConnectionHealth = (connectionId?: string) => {
  return useQuery({
    queryKey: queryKeys.connections.health(),
    queryFn: () => connectionsService.checkConnectionHealth(connectionId!),
    enabled: !!connectionId,
    staleTime: 5_000, // Health status is checked frequently
  });
};

/**
 * Hook to get connection status
 */
export const useConnectionStatus = (connectionId?: string) => {
  return useQuery({
    queryKey: queryKeys.connections.detail(connectionId || ''),
    queryFn: () => connectionsService.getConnectionStatus(connectionId!),
    enabled: !!connectionId,
    staleTime: 10_000,
  });
};

/**
 * Hook to invalidate connections queries
 * Useful for mutations that need to refresh connections data
 */
export const useInvalidateConnections = () => {
  const queryClient = useQueryClient();

  return {
    invalidateList: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.lists() });
    },
    invalidateDetail: (id: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.detail(id) });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() });
    },
    invalidateHealth: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.health() });
    },
  };
};
