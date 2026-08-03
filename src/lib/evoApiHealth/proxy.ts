// ExternalDbProxyClient — acesso direto ao Supabase (schema `zapp`).
//
// Pós-consolidação da arquitetura (único backend: Supabase self-hosted
// atomicabr; edge function external-db-proxy e schema legado `evo_api`
// eliminados), este cliente fala diretamente com o Supabase client
// (`@/integrations/supabase/client`, pinado em `db.schema = 'zapp'`) em vez
// de fazer chamadas HTTP ao edge function.
//
// A interface pública (call / rpc / select / update e o retorno
// { data, schema_unavailable }) é preservada para não quebrar consumidores.
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { PostgrestError } from '@supabase/supabase-js';

const log = getLogger('ExternalDbProxy');

// ---------------------------------------------------------------------------
// Dynamic accessors — mesmo padrão do safeClient.ts: bypass das unions de
// string-literal geradas para permitir nomes dinâmicos (vindos do body).
// ---------------------------------------------------------------------------
interface DynamicQueryBuilder
  extends PromiseLike<{ data: unknown; error: PostgrestError | null }> {
  select(columns?: string): DynamicQueryBuilder;
  eq(column: string, value: unknown): DynamicQueryBuilder;
  neq(column: string, value: unknown): DynamicQueryBuilder;
  lt(column: string, value: unknown): DynamicQueryBuilder;
  lte(column: string, value: unknown): DynamicQueryBuilder;
  gt(column: string, value: unknown): DynamicQueryBuilder;
  gte(column: string, value: unknown): DynamicQueryBuilder;
  like(column: string, value: unknown): DynamicQueryBuilder;
  ilike(column: string, value: unknown): DynamicQueryBuilder;
  is(column: string, value: unknown): DynamicQueryBuilder;
  in(column: string, values: unknown[]): DynamicQueryBuilder;
  contains(column: string, value: unknown): DynamicQueryBuilder;
  containedBy(column: string, value: unknown): DynamicQueryBuilder;
  overlaps(column: string, value: unknown): DynamicQueryBuilder;
  textSearch(column: string, value: unknown): DynamicQueryBuilder;
  filter(column: string, operator: string, value: unknown): DynamicQueryBuilder;
  not(column: string, operator: string, value: unknown): DynamicQueryBuilder;
  or(filters: string): DynamicQueryBuilder;
  match(query: Record<string, unknown>): DynamicQueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): DynamicQueryBuilder;
  limit(count: number): DynamicQueryBuilder;
  offset(start: number): DynamicQueryBuilder;
  update(values: Record<string, unknown>): DynamicQueryBuilder;
}

interface DynamicSupabaseClient {
  from(table: string): DynamicQueryBuilder;
}

type DynamicRpcClient = {
  rpc(
    name: string,
    params?: Record<string, unknown>
  ): Promise<{ data: unknown; error: PostgrestError | null }>;
};

// ignore-audit: dynamic table names are not in the generated union
const _dynamicClient = supabase as unknown as DynamicSupabaseClient;
// ignore-audit: dynamic RPC names are not in the generated union
const _rpcClient = supabase as unknown as DynamicRpcClient;

// Operadores aceitos no dispatch dinâmico (mesma allowlist do external-db-proxy).
const FILTER_OPERATORS = new Set([
  'eq',
  'neq',
  'lt',
  'lte',
  'gt',
  'gte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'overlaps',
  'textSearch',
  'filter',
  'not',
  'or',
  'match',
]);

// Erros transitórios de schema do PostgREST (PGRST106 = schema inválido,
// PGRST002 = schema cache) — merecem retry com backoff, como no proxy antigo.
const isTransientSchemaError = (message: string): boolean =>
  message.includes('PGRST106') ||
  message.includes('Invalid schema') ||
  message.includes('PGRST002') ||
  message.includes('schema cache');

const MAX_SCHEMA_RETRIES = 5;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface SelectOptions {
  table: string;
  select?: string;
  filters?: { column: string; operator: string; value: unknown }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
}

interface UpdateOptions {
  table: string;
  data: Record<string, unknown>;
  match: Record<string, unknown>;
}

/**
 * Encapsulates direct Supabase access for the evo API health module.
 */
class ExternalDbProxyClient {
  async call<T = unknown>(
    body: Record<string, unknown>,
    retryCount = 0
  ): Promise<{ data: T | null; schema_unavailable: boolean }> {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing)'
      );
    }

    try {
      const { data, error } = await this.execute(body);

      if (error) {
        const errorMsg = error.message;

        // PGRST106 (Invalid schema) or PGRST002 (Schema cache error)
        if (isTransientSchemaError(errorMsg) && retryCount < MAX_SCHEMA_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          log.warn('Transient schema error, retrying', {
            error: errorMsg,
            attempt: retryCount + 1,
            delayMs: Math.round(delay),
          });
          await sleep(delay);
          return this.call<T>(body, retryCount + 1);
        }

        throw new Error(errorMsg);
      }

      // ignore-audit: narrows Supabase query result to the local interface
      return { data: (data ?? null) as T | null, schema_unavailable: false };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (isTransientSchemaError(errorMsg) && retryCount < MAX_SCHEMA_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        log.warn('Transient schema error, retrying (catch)', {
          error: errorMsg,
          attempt: retryCount + 1,
          delayMs: Math.round(delay),
        });
        await sleep(delay);
        return this.call<T>(body, retryCount + 1);
      }
      throw error;
    }
  }

  private async execute(
    body: Record<string, unknown>
  ): Promise<{ data: unknown; error: PostgrestError | null }> {
    const action = body.action;

    if (action === 'rpc') {
      const name = String(body.rpc ?? '');
      const params = (body.params ?? {}) as Record<string, unknown>;
      return _rpcClient.rpc(name, params);
    }

    if (action === 'select') {
      const opts = body as unknown as SelectOptions;
      let query = _dynamicClient.from(opts.table).select(opts.select ?? '*');

      for (const f of opts.filters ?? []) {
        query = applyFilter(query, f);
      }
      if (opts.order?.column) {
        query = query.order(opts.order.column, { ascending: opts.order.ascending ?? true });
      }
      if (typeof opts.limit === 'number') query = query.limit(opts.limit);
      if (typeof opts.offset === 'number') query = query.offset(opts.offset);

      return query;
    }

    if (action === 'update') {
      const opts = body as unknown as UpdateOptions;
      return _dynamicClient.from(opts.table).update(opts.data).match(opts.match).select('*');
    }

    throw new Error(`Unknown proxy action: ${String(action)}`);
  }

  rpc<T = unknown>(name: string, params: Record<string, unknown> = {}) {
    return this.call<T>({ action: 'rpc', rpc: name, params });
  }

  select<T = unknown>(opts: {
    table: string;
    select?: string;
    filters?: { column: string; operator: string; value: unknown }[];
    order?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
  }) {
    return this.call<T[]>({ action: 'select', ...opts });
  }

  update<T = unknown>(opts: {
    table: string;
    data: Record<string, unknown>;
    match: Record<string, unknown>;
  }) {
    return this.call<T[]>({ action: 'update', ...opts });
  }
}

function applyFilter(
  query: DynamicQueryBuilder,
  f: { column: string; operator: string; value: unknown }
): DynamicQueryBuilder {
  const { column, operator, value } = f;
  if (!FILTER_OPERATORS.has(operator)) {
    log.warn('Unsupported filter operator, skipping', { column, operator });
    return query;
  }
  const method = (query as unknown as Record<string, unknown>)[operator];
  if (typeof method !== 'function') {
    log.warn('Filter operator not available on query builder, skipping', { column, operator });
    return query;
  }
  // ignore-audit: operator is allowlisted (FILTER_OPERATORS) — dynamic dispatch
  return (method as (column: string, value: unknown) => DynamicQueryBuilder).call(
    query,
    column,
    value
  );
}

// Export a singleton instance
/** evo Api constant. */
export const evoApi = new ExternalDbProxyClient();
