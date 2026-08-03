/**
 * Client helper for querying the consolidated self-hosted Supabase.
 *
 * CONSOLIDAÇÃO (2026-07-15): a arquitetura "dois Supabase" e a edge function
 * `external-db-proxy` foram eliminadas — o app usa uma única instância
 * (https://supabase.atomicabr.com.br, schema `zapp`). Este módulo mantém a
 * mesma superfície pública (`queryExternalProxy` / `queryExternalProxyBatch`)
 * para não quebrar os consumidores, mas executa as queries diretamente via
 * Supabase JS client (o mesmo cliente de `@/integrations/supabase/client`,
 * acessado pelo shim `externalClient`).
 *
 * Cada chamada é cronometrada e registrada via `clientTelemetry` (source
 * 'selfHosted') para que DevTools e o painel de telemetria continuem
 * exibindo duração, filtros, recordCount e trace id.
 */
import { recordQueryEvent, classifySeverity, type QueryOperation } from '@/lib/clientTelemetry';
import { generateCorrelationId } from '@/lib/correlationId';
import { getLogger } from '@/lib/logger';
import { getExternalSupabase } from '@/integrations/supabase/externalClient';

const proxyLog = getLogger('externalProxy');

// ─── Param interfaces (contrato compatível com o antigo proxy) ───────────────
interface ProxySelectParams {
  table: string;
  select?: string;
  filters?: { column: string; operator: string; value: unknown }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
  cursor?: { column: string; operator: 'gt' | 'lt' | 'gte' | 'lte'; value: string };
  signal?: AbortSignal;
}

interface ProxyMutationParams {
  action: 'insert' | 'update';
  table: string;
  data?: Record<string, unknown> | Record<string, unknown>[];
  match?: Record<string, unknown>;
}

interface ProxyRPCParams {
  action: 'rpc';
  rpc: string;
  params?: Record<string, unknown>;
}

type ProxyParams = ProxySelectParams | ProxyMutationParams | ProxyRPCParams;

interface ProxyResponse<T = unknown> {
  data: T[];
  count?: number;
  error?: string;
}

// ─── Supabase query-builder bridge ───────────────────────────────────────────
/** Resultado mínimo de uma execução PostgREST (PostgrestResponse). */
interface QueryResult {
  data: unknown;
  count: number | null;
  error: { message: string; name?: string } | null;
}

/** Cadeia encadeável E aguardável do supabase-js (tipagem estrutural mínima). */
type AwaitableChain = QueryChain & PromiseLike<QueryResult>;

interface QueryChain {
  select(columns: string, opts?: { count?: 'exact' | 'planned' | 'estimated' }): AwaitableChain;
  eq(column: string, value: unknown): AwaitableChain;
  neq(column: string, value: unknown): AwaitableChain;
  gt(column: string, value: unknown): AwaitableChain;
  gte(column: string, value: unknown): AwaitableChain;
  lt(column: string, value: unknown): AwaitableChain;
  lte(column: string, value: unknown): AwaitableChain;
  ilike(column: string, pattern: string): AwaitableChain;
  like(column: string, pattern: string): AwaitableChain;
  in(column: string, values: unknown[]): AwaitableChain;
  is(column: string, value: unknown): AwaitableChain;
  order(column: string, opts?: { ascending?: boolean }): AwaitableChain;
  limit(count: number): AwaitableChain;
  offset(count: number): AwaitableChain;
  abortSignal(signal: AbortSignal): AwaitableChain;
  match(values: Record<string, unknown>): AwaitableChain;
  insert(values: unknown): AwaitableChain;
  update(values: unknown): AwaitableChain;
}

interface DirectClient {
  from(table: string): AwaitableChain;
  rpc(fn: string, args?: Record<string, unknown>): AwaitableChain;
}

/** Cliente Supabase único (shim externalClient → @/integrations/supabase/client). */
const client = getExternalSupabase() as unknown as DirectClient;

// ─── Filtros ─────────────────────────────────────────────────────────────────
function applyFilters(
  query: AwaitableChain,
  filters?: ProxySelectParams['filters']
): AwaitableChain {
  if (!filters || filters.length === 0) return query;
  let q: AwaitableChain = query;
  for (const f of filters) {
    switch (f.operator) {
      case 'eq':
        q = q.eq(f.column, f.value);
        break;
      case 'neq':
        q = q.neq(f.column, f.value);
        break;
      case 'gt':
        q = q.gt(f.column, f.value);
        break;
      case 'gte':
        q = q.gte(f.column, f.value);
        break;
      case 'lt':
        q = q.lt(f.column, f.value);
        break;
      case 'lte':
        q = q.lte(f.column, f.value);
        break;
      case 'ilike':
        q = q.ilike(f.column, String(f.value));
        break;
      case 'like':
        q = q.like(f.column, String(f.value));
        break;
      case 'in':
        q = q.in(f.column, Array.isArray(f.value) ? f.value : [f.value]);
        break;
      case 'is':
        q = q.is(f.column, f.value);
        break;
      default:
        proxyLog.warn('unsupported filter operator, falling back to eq', {
          column: f.column,
          operator: f.operator,
        });
        q = q.eq(f.column, f.value);
    }
  }
  return q;
}

// ─── Telemetria ──────────────────────────────────────────────────────────────
interface TelemetryMeta {
  operation: QueryOperation;
  target: string;
  limit: number | null;
  offset: number | null;
  filters: Record<string, unknown> | null;
}

function deriveMeta(params: ProxyParams): TelemetryMeta {
  if ('action' in params && params.action === 'rpc') {
    return {
      operation: 'rpc',
      target: params.rpc,
      limit: null,
      offset: null,
      filters: params.params ?? null,
    };
  }
  if ('action' in params) {
    return {
      operation: params.action,
      target: params.table,
      limit: null,
      offset: null,
      filters: params.match ?? null,
    };
  }
  return {
    operation: 'select',
    target: params.table,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
    filters: params.filters ? { filters: params.filters } : params.cursor ? { cursor: params.cursor } : null,
  };
}

// ─── Execução direta no Supabase ─────────────────────────────────────────────
async function executeDirect<T>(params: ProxyParams): Promise<ProxyResponse<T>> {
  const meta = deriveMeta(params);
  const correlationId = generateCorrelationId();
  const startedAt = performance.now();

  let result: QueryResult;
  try {
    if (!('action' in params)) {
      // SELECT
      const { table, select = '*', filters, order, limit, offset, cursor, countMode, signal } = params;
      let q: AwaitableChain = client
        .from(table)
        .select(select, countMode ? { count: countMode } : undefined);
      if (cursor) {
        q = applyFilters(q, [
          { column: cursor.column, operator: cursor.operator, value: cursor.value },
        ]);
      }
      q = applyFilters(q, filters);
      if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
      if (limit != null) q = q.limit(limit);
      if (offset != null) q = q.offset(offset);
      if (signal) q = q.abortSignal(signal);
      result = await q;
    } else if (params.action === 'rpc') {
      result = await client.rpc(params.rpc, params.params ?? {});
    } else if (params.action === 'insert') {
      result = await client.from(params.table).insert(params.data ?? {});
    } else {
      // update
      let q: AwaitableChain = client.from(params.table).update(params.data ?? {});
      if (params.match) q = q.match(params.match);
      result = await q;
    }
  } catch (err) {
    // Exceção inesperada do próprio cliente (ex.: falha de rede) — registra e repassa.
    const message = (err as Error)?.message ?? 'unknown';
    const isAbort = (err as Error)?.name === 'AbortError' || /abort/i.test(message);
    const durationMs = Math.round(performance.now() - startedAt);
    recordQueryEvent({
      ...meta,
      source: 'selfHosted',
      durationMs,
      recordCount: null,
      errorMessage: message,
      severity: isAbort ? 'error' : classifySeverity(durationMs, true, false),
      startedAt,
      correlationId,
    });
    throw err;
  }

  if (result.error) {
    const message = result.error.message || 'External DB query error';
    const isAbort = result.error.name === 'AbortError' || /abort/i.test(message);
    const durationMs = Math.round(performance.now() - startedAt);
    recordQueryEvent({
      ...meta,
      source: 'selfHosted',
      durationMs,
      recordCount: null,
      errorMessage: message,
      severity: isAbort ? 'error' : classifySeverity(durationMs, true, false),
      startedAt,
      correlationId,
    });
    if (isAbort) {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw new Error(`[cid=${correlationId}] ${message}`);
  }

  // O antigo proxy normalizava respostas não-array (RPC jsonb / insert) para
  // `data: T[]`; mantemos o mesmo contrato para os consumidores.
  const rows = Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data];
  const durationMs = Math.round(performance.now() - startedAt);
  recordQueryEvent({
    ...meta,
    source: 'selfHosted',
    durationMs,
    recordCount: rows.length,
    startedAt,
    correlationId,
  });

  return {
    data: rows as T[],
    ...(result.count != null ? { count: result.count } : {}),
  };
}

// ─── Public entry points ─────────────────────────────────────────────────────
/** Executa uma query/escrita diretamente no Supabase consolidado. */
export async function queryExternalProxy<T = unknown>(
  params: ProxyParams
): Promise<ProxyResponse<T>> {
  return executeDirect<T>(params);
}

/** Executa várias queries/escritas em paralelo, na ordem dada. */
export async function queryExternalProxyBatch<T = unknown>(
  queries: ProxyParams[]
): Promise<ProxyResponse<T>[]> {
  return Promise.all(queries.map((q) => executeDirect<T>(q)));
}
