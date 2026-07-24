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

// Escape hatch for email_app schema RPCs absent from the generated TypeScript types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _emailRpc = supabase.rpc as any;

// Dynamic table accessor — bypasses the overloaded `from()` signature that
// requires a string-literal table name from the generated types.
type DynamicSupabaseClient = { from(t: string): ReturnType<typeof supabase.from> };
type DynamicSchemaClient = { schema(schema: string): DynamicSupabaseClient };

let _emailAppClient: DynamicSupabaseClient | undefined;
function getEmailAppClient(): DynamicSupabaseClient {
  if (!_emailAppClient) {
    _emailAppClient = (supabase as unknown as DynamicSchemaClient).schema('email_app');
  }
  return _emailAppClient;
}

const MAX_FAILURES = 20;
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 100;

const telemetry: ClientTelemetry = {
  lastValidation: null,
  recentFailures: [],
  stats: { totalCalls: 0, failedCalls: 0, cacheHits: 0 },
};

const resourceCache = new Map<string, { exists: boolean; expires: number }>();
const _validationInFlight = new Map<string, Promise<boolean>>();
let _healthLogInProgress = false;

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
  return (supabase as unknown as DynamicSupabaseClient).from(table);
}

/** safe Client. */
export const safeClient = {
  async from<T = unknown>(
    table: string,
    queryBuilder: (query: SafeQueryBuilder) => PromiseLike<{ data: unknown; error: unknown }>
  ): Promise<SafeResponse<T[]>> {
    const requestId = crypto.randomUUID();
    telemetry.stats.totalCalls++;
    try {
      if (table.startsWith('email_')) {
        const exists = await this.validateResource(table, 'table');
        if (!exists) {
          this.log(requestId, 'warn', `Tabela ${table} não encontrada no schema.`, { table });
          await this.recordFailure(requestId, 'from', table, `Tabela ${table} não encontrada`);
          return { data: [] as T[], error: new Error(`Tabela ${table} não disponível`), requestId };
        }
      }
      const client = table.startsWith('email_') ? getEmailAppClient() : (supabase as unknown as DynamicSupabaseClient);
      const { data, error } = await queryBuilder(client.from(table));
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
    }
  ): Promise<SafeResponse<T>> {
    const requestId = crypto.randomUUID();
    telemetry.stats.totalCalls++;
    try {
      validateTableName(table);

      if (table.startsWith('email_')) {
        const exists = await this.validateResource(table, 'table');
        if (!exists) {
          this.log(requestId, 'warn', `Tabela ${table} não encontrada para single()`, { table });
          await this.recordFailure(requestId, 'single', table, `Tabela ${table} não encontrada`);
          return { data: null, error: new Error(`Tabela ${table} não disponível`), requestId };
        }
      }
      const client = table.startsWith('email_') ? getEmailAppClient() : (supabase as unknown as DynamicSupabaseClient);
      const { data, error } = await queryBuilder(client.from(table)).single();
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

  async rpc<T = unknown>(name: string, params?: Record<string, unknown>): Promise<SafeResponse<T>> {
    const requestId = crypto.randomUUID();
    telemetry.stats.totalCalls++;
    try {
      if (name.startsWith('rpc_email_')) {
        const exists = await this.validateResource(name, 'function');
        if (!exists) {
          this.log(requestId, 'warn', `RPC ${name} não encontrada no schema.`, { function: name });
          await this.recordFailure(requestId, 'rpc', name, `Função ${name} não encontrada`);
          return { data: null, error: new Error(`Função ${name} não disponível`), requestId };
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc(name as any, params); // ignore-audit — dynamic RPC name not in generated union
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
          const client = name.startsWith('email_') ? getEmailAppClient() : (supabase as unknown as DynamicSupabaseClient);
          const { error } = await client
            .from(name)
            .select('count', { count: 'exact', head: true })
            .limit(0);
          if (!error) {
            exists = true;
          } else {
            const msg = ((error as { message?: string }).message ?? "").toLowerCase();
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
          const { error } = await (
            supabase.rpc(name as Parameters<typeof supabase.rpc>[0]) as unknown as {
              limit: (n: number) => Promise<{ error: unknown }>;
            }
          ).limit(0); // ignore-audit — .limit() not on RPC return type in generated types
          if (!error) {
            exists = true;
          } else {
            const msg = ((error as { message?: string }).message ?? "").toLowerCase();
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

  // Uses supabase.rpc() directly — NOT this.rpc() — to avoid recordFailure() recursion.
  async syncHealthState() {
    if (_healthLogInProgress) return;
    _healthLogInProgress = true;
    try {
      const snap = this.getTelemetry();
      let status: 'healthy' | 'degraded' | 'error' = 'healthy';
      if (snap.recentFailures.length > 10) status = 'error';
      else if (snap.recentFailures.length > 0) status = 'degraded';

      type RpcResult = { data: unknown; error: { message: string } | null };
      const { error: rpcErr } = (await _emailRpc('rpc_update_email_health_state', {
        p_status: status,
        p_failure_count: snap.recentFailures.length,
        p_metadata: {
          total_calls: snap.stats.totalCalls,
          cache_hits: snap.stats.cacheHits,
          last_validation: snap.lastValidation?.toISOString(),
        },
      })) as RpcResult;
      if (rpcErr) {
        _log.warn('Erro ao sincronizar estado de saúde', { error: rpcErr.message });
      }
    } catch (err) {
      _log.warn('Erro ao sincronizar estado de saúde (exceção)', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      _healthLogInProgress = false;
    }
  },

  log(requestId: string, level: 'info' | 'warn' | 'error', message: string, detail?: unknown) {
    const maskedDetail = this.maskSensitiveData(detail);
    const meta: Record<string, unknown> = { requestId };
    if (maskedDetail != null) meta['detail'] = maskedDetail;
    if (level === 'error') _log.error(`${message}`, meta);
    else if (level === 'warn') _log.warn(`${message}`, meta);
    else _log.info(`${message}`, meta);
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

  // Uses supabase.rpc() directly — NOT this.rpc() — to prevent recordFailure() → rpc() → recordFailure() recursion.
  async recordFailure(requestId: string, operation: string, resource: string, error: string) {
    const record: FailureRecord = {
      requestId,
      operation,
      resource,
      error,
      timestamp: new Date().toISOString(),
    };
    telemetry.recentFailures.unshift(record as unknown as OperationFailure);
    if (telemetry.recentFailures.length > MAX_FAILURES) telemetry.recentFailures.pop();

    if (_healthLogInProgress) return;
    _healthLogInProgress = true;
    try {
      type RpcResult = { data: unknown; error: { message: string } | null };
      const { error: rpcErr } = (await _emailRpc('rpc_log_email_health', {
        p_status: 'error',
        p_operation: operation,
        p_resource: resource,
        p_request_id: requestId,
        p_error_message: error,
        p_is_failure: true,
      })) as RpcResult;
      if (rpcErr) {
        _log.warn('Falha ao persistir log de saúde', { error: rpcErr.message });
      }
    } catch (dbErr) {
      _log.warn('Falha ao persistir log de saúde (exceção)', {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    } finally {
      _healthLogInProgress = false;
    }
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