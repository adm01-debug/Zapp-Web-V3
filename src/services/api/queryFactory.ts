/**
 * Query Factory - Standard patterns for creating queries
 *
 * This factory standardizes how queries are created across the application,
 * reducing boilerplate and ensuring consistent error handling, caching,
 * and retry logic.
 *
 * Usage:
 * const { data, isLoading } = queryFactory.useList('contacts', contactsService.list);
 * const { data } = queryFactory.useDetail('contacts', id, contactsService.get);
 */

import { UseQueryOptions, useQuery } from '@tanstack/react-query';

interface QueryFactoryOptions<TData> extends Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'> {
  staleTime?: number;
  gcTime?: number;
  retry?: boolean | number;
}

/**
 * Factory for creating list queries
 * Used for fetching collections of data
 */
export const createListQuery = <TData = any>(
  queryKey: readonly any[],
  queryFn: () => Promise<TData[]>,
  options?: QueryFactoryOptions<TData[]>
) => {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: options?.staleTime ?? 30_000, // 30s default
    gcTime: options?.gcTime ?? 5 * 60_000, // 5m default
    retry: options?.retry ?? 2,
    ...options,
  });
};

/**
 * Factory for creating detail/get queries
 * Used for fetching individual items
 */
export const createDetailQuery = <TData = any>(
  queryKey: readonly any[],
  queryFn: () => Promise<TData>,
  enabled: boolean = true,
  options?: QueryFactoryOptions<TData>
) => {
  return useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: options?.staleTime ?? 60_000, // 60s default (longer for detail)
    gcTime: options?.gcTime ?? 10 * 60_000, // 10m default
    retry: options?.retry ?? 2,
    ...options,
  });
};

/**
 * Factory for creating search queries
 * Used for searching/filtering data in real-time
 */
export const createSearchQuery = <TData = any>(
  queryKey: readonly any[],
  queryFn: () => Promise<TData[]>,
  enabled: boolean = true,
  options?: QueryFactoryOptions<TData[]>
) => {
  return useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: options?.staleTime ?? 10_000, // 10s (shorter for search)
    gcTime: options?.gcTime ?? 2 * 60_000, // 2m
    retry: options?.retry ?? 1, // Single retry for search
    ...options,
  });
};

/**
 * Factory for creating realtime/streaming queries
 * Used for data that updates frequently
 */
export const createRealtimeQuery = <TData = any>(
  queryKey: readonly any[],
  queryFn: () => Promise<TData>,
  enabled: boolean = true,
  options?: QueryFactoryOptions<TData>
) => {
  return useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: 0, // Always stale (realtime)
    gcTime: options?.gcTime ?? 5 * 60_000,
    retry: options?.retry ?? 2,
    refetchInterval: options?.refetchInterval ?? 5_000, // 5s default
    ...options,
  });
};

/**
 * Factory for creating paginated queries
 * Used for loading paginated data
 */
export const createPaginatedQuery = <TData = any>(
  queryKey: readonly any[],
  queryFn: () => Promise<{ data: TData[]; total: number; page: number }>,
  options?: QueryFactoryOptions<{ data: TData[]; total: number; page: number }>
) => {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
    retry: options?.retry ?? 2,
    ...options,
  });
};

/**
 * Factory for creating infinite queries
 * Used for infinite scroll / load more patterns
 */
export const createInfiniteQuery = <TData = any>(
  queryKey: readonly any[],
  queryFn: (pageParam: number) => Promise<TData[]>,
  options?: QueryFactoryOptions<TData[]>
) => {
  // This is a placeholder - use useInfiniteQuery hook directly
  // as it requires additional configuration beyond this factory
  return null;
};

/**
 * Default error handler for queries
 * Can be customized per application needs
 */
export const handleQueryError = (error: any, fallbackMessage?: string) => {
  console.error('Query error:', error);

  // Handle specific error types
  if (error?.code === 'NETWORK_ERROR') {
    return 'Erro de conexão. Verifique sua internet.';
  }

  if (error?.code === 'UNAUTHORIZED') {
    return 'Sua sessão expirou. Faça login novamente.';
  }

  if (error?.code === 'FORBIDDEN') {
    return 'Você não tem permissão para acessar este recurso.';
  }

  if (error?.code === 'NOT_FOUND') {
    return 'Recurso não encontrado.';
  }

  if (error?.code === 'TIMEOUT') {
    return 'A requisição demorou muito tempo. Tente novamente.';
  }

  return fallbackMessage || 'Ocorreu um erro ao carregar os dados.';
};

/**
 * Retry logic configuration
 * Can be customized for different scenarios
 */
export const retryConfig = {
  // Retry on specific status codes
  shouldRetry: (error: any, attemptIndex: number) => {
    // Don't retry on client errors
    if (error?.status >= 400 && error?.status < 500) {
      return false;
    }

    // Retry up to 3 times on server errors
    return attemptIndex < 3;
  },

  // Exponential backoff: 1s, 2s, 4s, 8s
  getDelay: (attemptIndex: number) => {
    return Math.min(1000 * 2 ** attemptIndex, 30_000);
  },
};
