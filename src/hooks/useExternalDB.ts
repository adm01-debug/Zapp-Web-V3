/**
 * useExternalDB — Generic hook for querying any table in the consolidated CRM database
 * Uses the main Supabase client directly (single-DB architecture; secured by RLS policies).
 * The external-db-proxy edge function is no longer used — all queries go straight
 * to the main self-hosted Supabase backend (schema 'zapp').
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { validateEntityAccess, validateRpcAccess } from '@/integrations/datasource/sentinel';
import type { SupabaseClient } from '@supabase/supabase-js';
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

  // Dynamic table names (evolution_*) are not part of the typed Database map —
  // cast to an untyped client, same pattern as the rest of the dynamic table access code.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extClient = supabase as unknown as SupabaseClient<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = extClient // ignore-audit — dynamic builder; type changes across .filter()/.order()/.range() chains
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
    queryKey: ['evolution-db', table, { select, filters, order, limit, offset, countMode }],
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
    enabled: enabled && isSupabaseConfigured,
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
    queryKey: ['evolution-db', 'rpc', options.rpc, options.params],
    queryFn: async () => {
      validateRpcAccess(options.rpc, 'external');
      const start = performance.now();
      // Dynamic RPC names are not part of the typed Database map — untyped client cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as SupabaseClient<any>).rpc(
        options.rpc,
        options.params || {}
      );
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
    enabled: (options.enabled ?? true) && isSupabaseConfigured,
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

// ─── Mutation (insert/update/delete via main Supabase client) ──
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
      // Dynamic table names (evolution_*) are not part of the typed Database map —
      // untyped client cast, same pattern as the rest of the dynamic table access code.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as unknown as SupabaseClient<any>;
      if (params.action === 'insert') {
        const { data, error } = await client
          .from(params.table)
          .insert(params.data ?? {})
          .select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'update') {
        let q = client.from(params.table).update(params.data ?? {});
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'delete') {
        let q = client.from(params.table).delete();
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evolution-db', variables.table] });
    },
  });
}
