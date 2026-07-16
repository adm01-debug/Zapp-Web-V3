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
import { isPermanentQueryError, tanstackRetry } from '@/lib/errors/queryErrors';

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

/**
 * Stub — infinite query nao foi implementado.
 * Use `useInfiniteQuery` do TanStack diretamente se necessario.
 *
 * FIX 2026-07-16: substituido `return null` por throw para evitar
 * crash silencioso em qualquer consumidor que tente desestruturar o retorno.
 */
export const createInfiniteQuery = <TData = any>(
  _queryKey: readonly any[],
  _queryFn: (pageParam: number) => Promise<TData[]>,
  _options?: QueryFactoryOptions<TData[]>
): never => {
  throw new Error(
    '[createInfiniteQuery] Nao implementado — use useInfiniteQuery do TanStack diretamente.'
  );
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

/**
 * Retry config alinhado com tanstackRetry/isPermanentQueryError.
 *
 * FIX 2026-07-16: versao anterior usava apenas `status >= 400 && < 500`
 * o que:
 *   - Bloqueava 404 (deveria ser retentavel)
 *   - Nao capturava 42501 (sem campo status, passsava pelo check)
 *
 * Agora usa isPermanentQueryError (a fonte de verdade centralizada).
 *
 * NOTA: este objeto NAO e integrado ao TanStack Query automaticamente.
 * Para hooks, use `retry: tanstackRetry` diretamente no useQuery.
 * retryConfig e para chamadas manuais fora do TanStack.
 */
export const retryConfig = {
  shouldRetry: (error: unknown, attemptIndex: number, maxAttempts = 3): boolean => {
    if (isPermanentQueryError(error)) return false;
    return attemptIndex < maxAttempts;
  },
  getDelay: (attemptIndex: number): number => {
    return Math.min(1000 * 2 ** attemptIndex, 30_000);
  },
};
