/**
 * Query Factory - Standard patterns for creating queries
 *
 * NOTA: Todos os factories usam `tanstackRetry` em vez de `retry: N` numerico.
 * Um retry numerico (ex: retry: 2) SOBRESCREVE a funcao do QueryClient global,
 * fazendo com que erros de permission denied (42501) sejam retentados
 * desnecessariamente mesmo com o QueryClient configurado corretamente.
 *
 * Ao usar `tanstackRetry`, o retry semantico e aplicado em TODOS os niveis.
 */

import { UseQueryOptions, useQuery } from '@tanstack/react-query';
import { log } from '@/lib/logger';
import { tanstackRetry } from '@/lib/errors/queryErrors';

interface QueryFactoryOptions<TData> extends Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'> {
  staleTime?: number;
  gcTime?: number;
  retry?: boolean | number | ((failureCount: number, error: unknown) => boolean);
}

/**
 * Factory for creating list queries
 */
export const createListQuery = <TData = any>(
  queryKey: readonly any[],
  queryFn: () => Promise<TData[]>,
  options?: QueryFactoryOptions<TData[]>
) => {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
    retry: options?.retry ?? tanstackRetry,
    ...options,
  });
};

/**
 * Factory for creating detail/get queries
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
    staleTime: options?.staleTime ?? 60_000,
    gcTime: options?.gcTime ?? 10 * 60_000,
    retry: options?.retry ?? tanstackRetry,
    ...options,
  });
};

/**
 * Factory for creating search queries
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
    staleTime: options?.staleTime ?? 10_000,
    gcTime: options?.gcTime ?? 2 * 60_000,
    retry: options?.retry ?? ((failureCount: number, error: unknown) =>
      tanstackRetry(failureCount, error, 1)
    ),
    ...options,
  });
};

/**
 * Factory for creating realtime/streaming queries.
 * NOTA: refetchInterval padrao removido — caller deve definir explicitamente
 * para evitar polling inadvertido em erros de permissao.
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
    staleTime: 0,
    gcTime: options?.gcTime ?? 5 * 60_000,
    retry: options?.retry ?? tanstackRetry,
    // refetchInterval removido do padrao: must be explicit
    // refetchInterval: options?.refetchInterval ?? 5_000, // REMOVIDO
    ...options,
  });
};

/**
 * Factory for creating paginated queries
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
    retry: options?.retry ?? tanstackRetry,
    ...options,
  });
};

export const createInfiniteQuery = <TData = any>(
  _queryKey: readonly any[],
  _queryFn: (pageParam: number) => Promise<TData[]>,
  _options?: QueryFactoryOptions<TData[]>
) => {
  return null;
};

export const handleQueryError = (error: unknown, fallbackMessage?: string) => {
  log.error('Query error:', error);
  const e = error as Record<string, unknown> | null;
  if (e?.code === 'NETWORK_ERROR') return 'Erro de conexao. Verifique sua internet.';
  if (e?.code === 'UNAUTHORIZED') return 'Sua sessao expirou. Faca login novamente.';
  if (e?.code === 'FORBIDDEN') return 'Voce nao tem permissao para acessar este recurso.';
  if (e?.code === 'NOT_FOUND') return 'Recurso nao encontrado.';
  if (e?.code === 'TIMEOUT') return 'A requisicao demorou muito tempo. Tente novamente.';

  return fallbackMessage || 'Ocorreu um erro ao carregar os dados.';
};

export const retryConfig = {
  shouldRetry: (error: unknown, attemptIndex: number) => {
    const e = error as { status?: number } | null;
    if (e?.status !== undefined && e.status >= 400 && e.status < 500) return false;
    return attemptIndex < 3;
  },
  getDelay: (attemptIndex: number) => {
    return Math.min(1000 * 2 ** attemptIndex, 30_000);
  },
};
