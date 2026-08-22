import { supabase as _supabase } from './client';
import { getLogger } from '@/lib/logger';
import type { PostgrestError } from '@supabase/supabase-js';
import type { SafeQueryBuilder } from './safeClientTypes';
import type {
  SafeResponse,
  OperationFailure,
  ClientTelemetry,
  CacheInfo,
  FailureRecord,
} from './safeClientTypes';
import {
  maskEmail as _maskEmail,
  maskSensitiveData as _maskSensitiveData,
  applyMasking as _applyMasking,
} from './safeClientMasking';

/** Re-exported module members. */
export type { SafeResponse, OperationFailure, ClientTelemetry, CacheInfo };
/** Re-exported module members. */
export { maskEmail, maskSensitiveData } from './safeClientMasking';

const supabase = _supabase;
const _log = getLogger('safeClient');

// Dynamic table accessor — bypasses the overloaded `from()` signature that
// requires a string-literal table name from the generated types.
// Interface mínima (não ReturnType) — o types completo (F4) torna o builder
// gigante e ReturnType dispara TS2589 (deep instantiation).
interface DynamicSupabaseClient {
  from(t: string): {
    select(
      columns: string,
      opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }
    ): { limit: (n: number) => Promise<{ data: unknown; error: PostgrestError | null }> };
    select(columns: string): Promise<{ data: unknown; error: PostgrestError | null }>;
  };
}

// Dynamic RPC accessor — bypasses the generated RPC-name union so dynamic/stub
// names can be called without compile-time errors.
type DynamicRpcClient = {
  rpc(
    name: string,
    params?: Record<string, unknown>
  ): Promise<{ data: unknown; error: PostgrestError | null }>;
};

// All email_* tables are accessible via auto-updatable views in the zapp schema.
// Do NOT use supabase.schema('email_app') — PostgREST may not expose that schema,
// and the zapp views handle routing transparently.
const _dynamicClient = supabase as unknown as DynamicSupabaseClient;
const _rpcClient = supabase as unknown as DynamicRpcClient;

const MAX_FAILURES = 20;
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 100;

// ---------------------------------------------------------------------------
// RCA 2026-08-20 — classificação de erros CLIENT-SIDE transitórios.
//
// Saturação/timeout da fila do semáforo (client.ts) e aborts (unmount,
// cancelRefetch do TanStack, page unload) NÃO são falhas do backend:
//  1. Logá-los como ERROR poluía console/Sentry (624 ERRORs em 103s de prod;
//     o tunnel do Sentry respondeu 429 pelo volume).
//  2. recordFailure disparava rpc_log_email_health PELA MESMA fila saturada —
//     amplificação: cada falha gerava outra request no meio do incidente.
// Erros desse grupo são logados como WARN e NUNCA geram persistência remota.
// ---------------------------------------------------------------------------
function isClientSideTransientError(detail: unknown): boolean {
  if (!detail) return false;
  const name =
    typeof detail === 'object' && detail !== null && 'name' in detail
      ? String((detail as { name?: unknown }).name ?? '')
      : '';
  const message =
    typeof detail === 'object' && detail !== null && 'message' in detail
      ? String((detail as { message?: unknown }).message ?? '')
      : typeof detail === 'string'
        ? detail
        : '';
  const text = `${name} ${message}`.toLowerCase();
  return (
    text.includes('aborterror') ||
    text.includes('signal is aborted') ||
    text.includes('slot acquire aborted') ||
    text.includes('queue saturated') ||
    text.includes('queue wait timed out') ||
    text.includes('request timed out') ||
    text.includes('page unload')
  );
}

const telemetry: ClientTelemetry = {
  lastValidation: null,
  recentFailures: [],
  stats: { totalCalls: 0, failedCalls: 0, cacheHits: 0 },
};

const resourceCache = new Map<string, { exists: boolean; expires: number }>();
const _validationInFlight = new Map<string, Promise<boolean>>();

function pruneResourceCache(): void {
  const entries = Array.from(resourceCache.entries()).sort((a, b) => a[1].expires - b[1].expires);
  while (resourceCache.size > CACHE_MAX_SIZE) {
    const oldest = entries.shift();
    if (oldest) resourceCache.delete(oldest[0]);
  }
}

// Prevents SQL injection via dynamic table names: only identifier-safe chars allowed.
function validateTableName(table: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(table)) {
    throw new Error(
      `Invalid table name: "${table}". Only alphanumeric, underscore, and dot characters are allowed.`
    );
  }
}

/** safe From. */
export function safeFrom(table: string): SafeQueryBuilder {
  validateTableName(table);
  return _dynamicClient.from(table);
}

// RCA 2026-08-21 (fan-out de fila / troca rápida de contato): nenhum caller
// deste módulo conseguia propagar AbortSignal — a assinatura não tinha onde
// plugar. O builder retornado por `queryBuilder(...)` ainda é "thenable"
// (não vira Promise de verdade até o await), então ele ainda expõe
// `.abortSignal()` do postgrest-js nesse ponto. Interceptamos aqui, antes do
// await, em vez de exigir que cada hook conheça a API interna do builder.
function withAbortSignal<B>(builder: B, signal: AbortSignal | undefined): B {
  if (!signal) return builder;
  const maybe = builder as unknown as { abortSignal?: (s: AbortSignal) => B };
  return typeof maybe.abortSignal === 'function' ? maybe.abortSignal(signal) : builder;
}

/** safe Client. */
export const safeClient = {
  async from<T = unknown>(
    table: string,
    queryBuilder: (query: SafeQueryBuilder) => PromiseLike<{ data: unknown; error: unknown }>,
    signal?: AbortSignal
  ): Promise<SafeResponse<T[]>> {
    const requestId = crypto.randomUUID();
    telemetry.stats.totalCalls++;
    try {
      const builder = withAbortSignal(queryBuilder(_dynamicClient.from(table)), signal);
      const { data, error } = await builder;
      if (error) {
        this.log(requestId, 'error', `Erro na query from ${table}`, error);
        await this.recordFailure(
          requestId,
          'from',
          table,
          (error as { message?: string }).message || 'Erro desconhecido'
        );
        telemetry.stats.failedCalls++;
        return { data: [] as T[], error: this.formatError(error), requestId };
      }
      return { data: (Array.isArray(data) ? data : []) as T[], error: null, requestId };
    } catch (err) {
      this.log(requestId, 'error', `Erro crítico ao consultar tabela ${table}`, err);
      await this.recordFailure(
        requestId,
        'from',
        table,
        err instanceof Error ? err.message : String(err)
      );
      telemetry.stats.failedCalls++;
      return {
        data: [] as T[],
        error: err instanceof Error ? err : new Error(String(err)),
        requestId,
      };
    }
  },

  async single<T = unknown>(
    table: string,
    queryBuilder: (query: SafeQueryBuilder) => {
      single(): PromiseLike<{ data: unknown; error: unknown }>;
    },
    signal?: AbortSignal
  ): Promise<SafeResponse<T>> {
    const requestId = crypto.randomUUID();
    telemetry.stats.totalCalls++;
    try {
      validateTableName(table);
      const builder = withAbortSignal(queryBuilder(_dynamicClient.from(table)).single(), signal);
      const { data, error } = await builder;
      if (error) {
        this.log(requestId, 'error', `Erro single query ${table}`, error);
        await this.recordFailure(
          requestId,
          'single',
          table,
          (error as { message?: string }).message || 'Erro desconhecido'
        );
        telemetry.stats.failedCalls++;
        return { data: null, error: this.formatError(error), requestId };
      }
      return { data: data as T, error: null, requestId }; // ignore-audit: narrows Supabase query result to local interface
    } catch (err) {
      this.log(requestId, 'error', `Erro crítico single ${table}`, err);
      await this.recordFailure(
        requestId,
        'single',
        table,
        err instanceof Error ? err.message : String(err)
      );
      telemetry.stats.failedCalls++;
      return { data: null, error: err instanceof Error ? err : new Error(String(err)), requestId };
    }
  },

  async rpc<T = unknown>(
    name: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<SafeResponse<T>> {
    const requestId = crypto.randomUUID();
    telemetry.stats.totalCalls++;
    try {
      // ignore-audit — dynamic RPC name not in generated union
      const builder = withAbortSignal(_rpcClient.rpc(name, params), signal);
      const { data, error } = await builder;
      if (error) {
        this.log(requestId, 'error', `Erro ao executar RPC ${name}`, error);
        await this.recordFailure(requestId, 'rpc', name, error.message || 'Erro desconhecido');
        telemetry.stats.failedCalls++;
        return { data: null, error: this.formatError(error), requestId };
      }
      if (data === undefined || data === null) return { data: null, error: null, requestId };
      return { data: data as T, error: null, requestId }; // ignore-audit: narrows Supabase query result to local interface
    } catch (err) {
      this.log(requestId, 'error', `Erro crítico RPC ${name}`, err);
      await this.recordFailure(
        requestId,
        'rpc',
        name,
        err instanceof Error ? err.message : String(err)
      );
      telemetry.stats.failedCalls++;
      return { data: null, error: err instanceof Error ? err : new Error(String(err)), requestId };
    }
  },

  // 401/403/permission_denied = resource EXISTS, role lacks access; 42P01/42883 = truly absent.
  async validateResource(name: string, type: 'function' | 'table' = 'table'): Promise<boolean> {
    const cacheKey = `${type}:${name}`;
    const cached = resourceCache.get(cacheKey);
    if (cached) {
      if (cached.expires > Date.now()) {
        telemetry.stats.cacheHits++;
        return cached.exists;
      }
      resourceCache.delete(cacheKey);
    }

    const inFlight = _validationInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const promise = (async (): Promise<boolean> => {
      telemetry.lastValidation = new Date();
      try {
        let exists = false;
        if (type === 'table') {
          const { error } = await _dynamicClient
            .from(name)
            .select('count', { count: 'exact', head: true })
            .limit(0);
          if (!error) {
            exists = true;
          } else {
            const msg = ((error as { message?: string }).message ?? '').toLowerCase();
            const isPermissionError =
              msg.includes('permission denied') ||
              msg.includes('42501') ||
              msg.includes('jwt') ||
              msg.includes('unauthorized') ||
              msg.includes('invalid api key') ||
              msg.includes('row-level security');
            const isNotFound =
              msg.includes('does not exist') ||
              msg.includes('not found') ||
              msg.includes('42p01') ||
              msg.includes('relation');
            exists = isPermissionError || !isNotFound;
          }
        } else {
          // ignore-audit — .limit() not on RPC return type in generated types
          const { error } = await (
            supabase as unknown as {
              rpc: (name: string) => { limit: (n: number) => Promise<{ error: unknown }> };
            }
          )
            .rpc(name)
            .limit(0);
          if (!error) {
            exists = true;
          } else {
            const msg = ((error as { message?: string }).message ?? '').toLowerCase();
            const isPermissionError =
              msg.includes('permission denied') ||
              msg.includes('42501') ||
              msg.includes('jwt') ||
              msg.includes('unauthorized') ||
              msg.includes('invalid api key');
            const isNotFound =
              msg.includes('does not exist') || msg.includes('not found') || msg.includes('42883');
            exists = isPermissionError || !isNotFound;
          }
        }
        resourceCache.set(cacheKey, { exists, expires: Date.now() + CACHE_TTL });
        if (resourceCache.size > CACHE_MAX_SIZE) pruneResourceCache();
        return exists;
      } catch {
        return false;
      } finally {
        _validationInFlight.delete(cacheKey);
      }
    })();

    _validationInFlight.set(cacheKey, promise);
    return promise;
  },

  // RCA 2026-08-20: syncHealthState() foi removido — não tinha NENHUM caller
  // e chamava rpc_update_email_health_state, que só tem EXECUTE para
  // postgres/service_role (permission denied garantido para o browser).

  log(requestId: string, level: 'info' | 'warn' | 'error', message: string, detail?: unknown) {
    const maskedDetail = this.maskSensitiveData(detail);
    const meta: Record<string, unknown> = { requestId };
    if (maskedDetail != null) meta['detail'] = maskedDetail;
    // RCA 2026-08-20: erros client-side transitórios (abort de unmount/
    // cancelRefetch, fila do semáforo saturada, timeout local, page unload)
    // são ruído esperado sob carga — rebaixados a WARN para não inundar
    // console/Sentry durante o próprio incidente que os causou.
    const effectiveLevel =
      level === 'error' && isClientSideTransientError(detail) ? 'warn' : level;
    if (effectiveLevel === 'error') _log.error(message, meta);
    else if (effectiveLevel === 'warn') _log.warn(message, meta);
    else _log.info(message, meta);
  },

  maskSensitiveData(data: unknown): unknown {
    if (!data) return data;
    if (typeof data !== 'object') {
      if (typeof data === 'string' && (data.length > 50 || data.includes('@'))) {
        return this.applyMasking(data);
      }
      return data;
    }
    return _maskSensitiveData(data as Record<string, unknown> | unknown[]);
  },

  maskEmail(email: string): string {
    return _maskEmail(email);
  },

  applyMasking(str: string): string {
    return _applyMasking(str);
  },

  // RCA 2026-08-20: a persistência remota via rpc_log_email_health foi
  // REMOVIDA do browser. Motivos (verificados em produção):
  //  1. GRANT: rpc_log_email_health/rpc_update_email_health_state só têm
  //     EXECUTE para postgres/service_role — o role `authenticated` recebe
  //     "permission denied" em 100% das chamadas. O browser NUNCA conseguiu
  //     gravar; só gerava uma request extra fadada a falhar.
  //  2. AMPLIFICAÇÃO: a RPC passava pela MESMA fila do semáforo — durante
  //     saturação, cada query dropada disparava OUTRA request (463 tentativas
  //     de health-log falhas em 103s no log de 2026-08-20T22:26Z).
  //  3. O Promise.race de 5s não CANCELAVA a RPC subjacente — ela continuava
  //     ocupando a fila mesmo após o "timeout".
  // A telemetria em memória (getTelemetry) permanece; edge functions logam
  // saúde de email com service_role pelos seus próprios clientes.
  recordFailure(requestId: string, operation: string, resource: string, error: string) {
    const record: FailureRecord = {
      requestId,
      operation,
      resource,
      error,
      timestamp: new Date().toISOString(),
    };
    telemetry.recentFailures.unshift(record as unknown as OperationFailure);
    if (telemetry.recentFailures.length > MAX_FAILURES) telemetry.recentFailures.pop();
  },

  getTelemetry(): ClientTelemetry {
    return {
      lastValidation: telemetry.lastValidation,
      recentFailures: [...telemetry.recentFailures],
      stats: { ...telemetry.stats },
    };
  },

  getCacheInfo(): CacheInfo {
    const values = Array.from(resourceCache.values());
    const maxExpires = values.length > 0 ? Math.max(...values.map((v) => v.expires)) : null;
    const expiration = maxExpires !== null ? new Date(maxExpires) : null;
    return { expiration, size: resourceCache.size };
  },

  clearCache(prefix?: string) {
    if (!prefix) {
      resourceCache.clear();
      return;
    }
    for (const key of resourceCache.keys()) {
      if (key.includes(prefix)) resourceCache.delete(key);
    }
  },

  formatError(error: PostgrestError | unknown): Error {
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message;
      if (msg.toLowerCase().includes('does not exist')) {
        return new Error(`Recurso indisponível: ${msg}`);
      }
      return new Error(msg);
    }
    return new Error(String(error));
  },
};
