/**
 * useExternalDB — Generic hook for querying any table in the external CRM database
 * Uses externalSupabase client directly (secured by RLS policies on the external DB)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { validateEntityAccess, validateRpcAccess } from '@/integrations/datasource/sentinel';
import type {
  ExternalDBFilter,
  ExternalDBOrder,
  ExternalDBQueryResult,
  ExternalTableName,
} from '@/types/externalDB';

// ─── Direct query helper ──────────────────────────────────────
async function queryExternal<T = unknown>(params: {
  table: string;
  select?: string;
  filters?: ExternalDBFilter[];
  order?: ExternalDBOrder;
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
}): Promise<ExternalDBQueryResult<T>> {
  validateEntityAccess(params.table, 'external');
  const start = performance.now();

  let query = getExternalSupabase()
    .from(params.table)
    .select(params.select || '*', { count: params.countMode || undefined });

  if (params.filters) {
    for (const f of params.filters) {
      query = query.filter(f.column, f.operator, f.value as string);
    }
  }

  if (params.order) {
    query = query.order(params.order.column, { ascending: params.order.ascending ?? true });
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  const duration = Math.round(performance.now() - start);

  if (error) throw new Error(error.message);

  return {
    data: (data as T[]) || [],
    meta: {
      record_count: count ?? (Array.isArray(data) ? data.length : null),
      duration_ms: duration,
      severity: duration > 3000 ? 'slow' : 'ok',
    },
  };
}

// ─── Select query hook ────────────────────────────────────────
interface UseExternalSelectOptions {
  table: ExternalTableName | string;
  select?: string;
  filters?: ExternalDBFilter[];
  order?: ExternalDBOrder;
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
  enabled?: boolean;
  staleTime?: number;
}

export function useExternalSelect<T = Record<string, unknown>>(options: UseExternalSelectOptions) {
  const {
    table,
    select,
    filters,
    order,
    limit = 50,
    offset = 0,
    countMode,
    enabled = true,
    staleTime = 5 * 60 * 1000,
  } = options;

  return useQuery({
    queryKey: ['external-db', table, { select, filters, order, limit, offset, countMode }],
    queryFn: () =>
      queryExternal<T>({
        table,
        select,
        filters,
        order,
        limit,
        offset,
        countMode,
      }),
    enabled: enabled && isExternalConfigured,
    staleTime,
    gcTime: staleTime * 2,
  });
}

// ─── RPC call hook ────────────────────────────────────────────
interface UseExternalRPCOptions {
  rpc: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
  staleTime?: number;
}

export function useExternalRPC<T = unknown>(options: UseExternalRPCOptions) {
  return useQuery({
    queryKey: ['external-db', 'rpc', options.rpc, options.params],
    queryFn: async () => {
      validateRpcAccess(options.rpc, 'external');
      const start = performance.now();
      const { data, error } = await getExternalSupabase().rpc(options.rpc, options.params || {});
      const duration = Math.round(performance.now() - start);
      if (error) throw new Error(error.message);
      return {
        data: Array.isArray(data) ? (data as T[]) : [data as T],
        meta: {
          record_count: Array.isArray(data) ? data.length : 1,
          duration_ms: duration,
          severity: 'ok' as string,
        },
      };
    },
    enabled: (options.enabled ?? true) && isExternalConfigured,
    staleTime: options.staleTime ?? 10 * 60 * 1000,
  });
}

// ─── Paginated table browser ──────────────────────────────────
export function useExternalTableBrowser<T = Record<string, unknown>>(
  tableName: ExternalTableName | string
) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<ExternalDBFilter[]>([]);
  const [order, setOrder] = useState<ExternalDBOrder | undefined>();
  const [searchTerm, setSearchTerm] = useState('');

  const query = useExternalSelect<T>({
    table: tableName,
    filters,
    order,
    limit: pageSize,
    offset: page * pageSize,
    countMode: 'estimated',
    staleTime: 2 * 60 * 1000,
  });

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const goToPage = useCallback((p: number) => setPage(p), []);

  const addFilter = useCallback((filter: ExternalDBFilter) => {
    setFilters((prev) => [...prev, filter]);
    setPage(0);
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
    setPage(0);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
    setPage(0);
  }, []);

  const setSort = useCallback((column: string, ascending = true) => {
    setOrder({ column, ascending });
    setPage(0);
  }, []);

  return {
    data: query.data?.data || [],
    totalRecords: query.data?.meta?.record_count ?? 0,
    duration: query.data?.meta?.duration_ms ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message || null,
    page,
    pageSize,
    filters,
    order,
    searchTerm,
    setSearchTerm,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(0);
    },
    nextPage,
    prevPage,
    goToPage,
    addFilter,
    removeFilter,
    clearFilters,
    setSort,
    refetch: query.refetch,
  };
}

// ─── Mutation (insert/update/delete via external client) ──────
export function useExternalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      action: 'insert' | 'update' | 'delete';
      table: string;
      data?: Record<string, unknown> | Record<string, unknown>[];
      match?: Record<string, unknown>;
    }) => {
      validateEntityAccess(params.table, 'external');
      if (params.action === 'insert') {
        const { data, error } = await getExternalSupabase()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from(params.table as any)
          .insert(params.data)
          .select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'update') {
        let q = getExternalSupabase()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from(params.table as any)
          .update(params.data);
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'delete') {
        let q = getExternalSupabase().from(params.table).delete();
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external-db', variables.table] });
    },
  });
}
