import { supabase as _supabase } from './client';
import { getLogger } from '@/lib/logger';
import { PostgrestError } from '@supabase/supabase-js';

const supabase = _supabase;
const _log = getLogger('safeClient');

// ---------------------------------------------------------------------------
// AnyQueryResult — tipo para o callback passado a safeClient.from() e
// safeClient.single().
//
// Por que não usar ReturnType<typeof supabase.from> como retorno?
//   supabase.from(<tableName>) → PostgrestQueryBuilder
//   query.select().eq()...    → PostgrestFilterBuilder  (subclasse diferente)
//   FilterBuilder NÃO estende QueryBuilder → TS2739 em todos os callsites.
//
// Solução: anotar o retorno do callback como PromiseLike<{data,error}>, que
// é a interface comum que QUALQUER builder supabase implementa ao ser `await`ed.
// Isso é semanticamente correto: só precisamos que o callback retorne algo
// que, ao ser awaited, devolva { data, error }. O runtime já faz `await cb(q)`.
// ---------------------------------------------------------------------------
type AnyQueryResult = PromiseLike<{ data: unknown; error: PostgrestError | null }>;

export interface SafeResponse<T> {
  data: T | null;
  error: Error | null;
  requestId?: string;
}

/** Record of a single operation failure captured in the telemetry buffer. */
export interface OperationFailure {
  operation: string;
  table?: string;
  error: string;
  timestamp: number;
  requestId: string;
}

/** Telemetry snapshot returned by safeClient.getTelemetry(). */
export interface ClientTelemetry {
  lastValidation: Date | null;
  recentFailures: OperationFailure[];
  stats: {
    totalCalls: number;
    failedCalls: number;
    cacheHits: number;
  };
}

/** Cache metadata returned by safeClient.getCacheInfo(). */
export interface CacheInfo {
  expiration: Date | null;
  size: number;
}

const MAX_FAILURES = 20;
const REQUEST_TIMEOUT_MS = 15_000;

const telemetry: ClientTelemetry = {
  lastValidation: null,
  recentFailures: [],
  stats: { totalCalls: 0, failedCalls: 0, cacheHits: 0 },
};

const cache: CacheInfo = {
  expiration: null,
  size: 0,
};

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function recordFailure(operation: string, error: unknown, table?: string): void {
  const failure: OperationFailure = {
    operation,
    table,
    error: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
    requestId: generateRequestId(),
  };
  telemetry.recentFailures.push(failure);
  if (telemetry.recentFailures.length > MAX_FAILURES) {
    telemetry.recentFailures.shift();
  }
  telemetry.stats.failedCalls++;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]) as Promise<T>;
}

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return '***@' + (local || '');
  const masked = local.length > 2 ? local.slice(0, 2) + '***' : '***';
  return `${masked}@${domain}`;
};

export const maskSensitiveData = (
  data: Record<string, unknown> | unknown[],
): Record<string, unknown> | unknown[] => {
  const SENSITIVE_KEYS = new Set([
    'password', 'senha', 'secret', 'token', 'api_key', 'apikey', 'api-key',
    'access_token', 'refresh_token', 'private_key', 'auth_token',
  ]);
  const PARTIAL_KEYS = new Set(['email', 'e-mail', 'e_mail']);
  const LONG_TOKEN_PATTERN = /^[A-Za-z0-9+/=._-]{40,}$/;

  const maskValue = (key: string, value: unknown): unknown => {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return maskAny(value as Record<string, unknown> | unknown[]);
    }
    const k = key.toLowerCase();
    if (SENSITIVE_KEYS.has(k)) return '***MASKED***';
    if (PARTIAL_KEYS.has(k) && typeof value === 'string') return maskEmail(value);
    if (typeof value === 'string' && LONG_TOKEN_PATTERN.test(value)) return '***TOKEN***';
    return value;
  };

  const maskAny = (
    d: Record<string, unknown> | unknown[] | null | undefined,
  ): Record<string, unknown> | unknown[] => {
    if (Array.isArray(d)) return d.map(item => maskAny(item as Record<string, unknown>));
    if (!d || typeof d !== 'object') return {} as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(d as Record<string, unknown>).map(([k, v]) => [k, maskValue(k, v)]),
    );
  };

  return maskAny(data);
};

async function executeQuery<T>(
  operation: string,
  table: string,
  callback: (q: ReturnType<typeof supabase.from>) => AnyQueryResult,
): Promise<SafeResponse<T>> {
  const requestId = generateRequestId();
  telemetry.stats.totalCalls++;
  try {
    const q = supabase.from(table as any);
    const result = await withTimeout(
      Promise.resolve(callback(q)) as Promise<{ data: unknown; error: PostgrestError | null }>,
      REQUEST_TIMEOUT_MS,
    );
    if (result.error) {
      recordFailure(operation, result.error, table);
      return { data: null, error: result.error, requestId };
    }
    return { data: result.data as T, error: null, requestId };
  } catch (err) {
    recordFailure(operation, err, table);
    _log.error(`[${requestId}] ${operation} on '${table}' failed`, err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
      requestId,
    };
  }
}

async function _executeSingle<T>(
  table: string,
  callback: (q: ReturnType<typeof supabase.from>) => AnyQueryResult,
): Promise<SafeResponse<T>> {
  return executeQuery<T>('single', table, callback);
}

async function _executeFrom<T>(
  table: string,
  callback: (q: ReturnType<typeof supabase.from>) => AnyQueryResult,
): Promise<SafeResponse<T[]>> {
  const result = await executeQuery<T[]>('from', table, callback);
  return result;
}

async function _executeRpc<T = unknown>(
  fn: string,
  params?: Record<string, unknown>,
): Promise<SafeResponse<T>> {
  const requestId = generateRequestId();
  telemetry.stats.totalCalls++;
  try {
    const result = await withTimeout(
      (supabase.rpc as unknown as (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: PostgrestError | null }>)(fn, params),
      REQUEST_TIMEOUT_MS,
    );
    if (result.error) {
      recordFailure('rpc', result.error, fn);
      return { data: null, error: result.error, requestId };
    }
    return { data: result.data as T, error: null, requestId };
  } catch (err) {
    recordFailure('rpc', err, fn);
    _log.error(`[${requestId}] rpc '${fn}' failed`, err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
      requestId,
    };
  }
}

async function _invokeFunction<T = unknown>(
  fn: string,
  body?: unknown,
): Promise<SafeResponse<T>> {
  const requestId = generateRequestId();
  telemetry.stats.totalCalls++;
  try {
    const result = await withTimeout(
      supabase.functions.invoke(fn, { body }),
      REQUEST_TIMEOUT_MS,
    );
    if (result.error) {
      recordFailure('invoke', result.error, fn);
      return { data: null, error: result.error, requestId };
    }
    return { data: result.data as T, error: null, requestId };
  } catch (err) {
    recordFailure('invoke', err, fn);
    _log.error(`[${requestId}] invoke '${fn}' failed`, err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
      requestId,
    };
  }
}

function _getTelemetry(): ClientTelemetry {
  return { ...telemetry, recentFailures: [...telemetry.recentFailures] };
}

function _getCacheInfo(): CacheInfo {
  return { ...cache };
}

// ---------------------------------------------------------------------------
// State for the safeClient object below.
// These were lost during a merge conflict resolution — restored here.
// ---------------------------------------------------------------------------
export interface FailureRecord {
  requestId: string;
  operation: string;
  resource: string;
  error: string;
  timestamp: string;
}

const CACHE_TTL = 300000; // 5 minutes
const CACHE_MAX_SIZE = 500;
const resourceCache = new Map<string, { exists: boolean; expires: number }>();

function pruneResourceCache(): void {
  const now = Date.now();
  for (const [key, val] of resourceCache) {
    if (val.expires <= now) resourceCache.delete(key);
  }
  // If still over cap, evict oldest entries (Map preserves insertion order)
  if (resourceCache.size > CACHE_MAX_SIZE) {
    const overflow = resourceCache.size - CACHE_MAX_SIZE;
    let evicted = 0;
    for (const key of resourceCache.keys()) {
      if (evicted >= overflow) break;
      resourceCache.delete(key);
      evicted++;
    }
  }
}
let lastValidation: Date | null = null;
const recentFailures: FailureRecord[] = [];
const stats = { totalCalls: 0, failedCalls: 0, cacheHits: 0 };
let _healthLogInProgress = false;

export const safeClient = {
  async from<T = unknown>(
    table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryBuilder: (query: ReturnType<typeof supabase.from>) => any
  ): Promise<SafeResponse<T[]>> {
    const requestId = Math.random().toString(36).substring(7);
    stats.totalCalls++;
    try {
      if (table.startsWith('email_')) {
        const exists = await this.validateResource(table, 'table');
        if (!exists) {
          this.log(requestId, 'warn', `Tabela ${table} não encontrada no schema.`, { table });
          await this.recordFailure(requestId, 'from', table, `Tabela ${table} não encontrada`);
          return { data: [] as T[], error: new Error(`Tabela ${table} não disponível`), requestId };
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await queryBuilder(supabase.from(table as any));
      if (error) {
        this.log(requestId, 'error', `Erro na query from ${table}`, error);
        await this.recordFailure(requestId, 'from', table, error.message || 'Erro desconhecido');
        stats.failedCalls++;
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
      stats.failedCalls++;
      return {
        data: [] as T[],
        error: err instanceof Error ? err : new Error(String(err)),
        requestId,
      };
    }
  },

  async single<T = unknown>(
    table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryBuilder: (query: ReturnType<typeof supabase.from>) => any
  ): Promise<SafeResponse<T>> {
    const requestId = Math.random().toString(36).substring(7);
    stats.totalCalls++;
    try {
      if (table.startsWith('email_')) {
        const exists = await this.validateResource(table, 'table');
        if (!exists) {
          this.log(requestId, 'warn', `Tabela ${table} não encontrada para single()`, { table });
          await this.recordFailure(requestId, 'single', table, `Tabela ${table} não encontrada`);
          return { data: null, error: new Error(`Tabela ${table} não disponível`), requestId };
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (queryBuilder(supabase.from(table as any)) as any).single();
      if (error) {
        this.log(requestId, 'error', `Erro single query ${table}`, error);
        await this.recordFailure(requestId, 'single', table, error.message || 'Erro desconhecido');
        stats.failedCalls++;
        return { data: null, error: this.formatError(error), requestId };
      }
      return { data: data as T, error: null, requestId };
    } catch (err) {
      this.log(requestId, 'error', `Erro crítico single ${table}`, err);
      await this.recordFailure(
        requestId,
        'single',
        table,
        err instanceof Error ? err.message : String(err)
      );
      stats.failedCalls++;
      return { data: null, error: err instanceof Error ? err : new Error(String(err)), requestId };
    }
  },

  async rpc<T = unknown>(name: string, params?: Record<string, unknown>): Promise<SafeResponse<T>> {
    const requestId = Math.random().toString(36).substring(7);
    stats.totalCalls++;
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
      const { data, error } = await supabase.rpc(name as any, params);
      if (error) {
        this.log(requestId, 'error', `Erro ao executar RPC ${name}`, error);
        await this.recordFailure(requestId, 'rpc', name, error.message || 'Erro desconhecido');
        stats.failedCalls++;
        return { data: null, error: this.formatError(error), requestId };
      }
      if (data === undefined || data === null) return { data: null, error: null, requestId };
      return { data: data as T, error: null, requestId };
    } catch (err) {
      this.log(requestId, 'error', `Erro crítico RPC ${name}`, err);
      await this.recordFailure(
        requestId,
        'rpc',
        name,
        err instanceof Error ? err.message : String(err)
      );
      stats.failedCalls++;
      return { data: null, error: err instanceof Error ? err : new Error(String(err)), requestId };
    }
  },

  /**
   * Verifica se um RPC ou Tabela existe no schema público com cache.
   *
   * 401/403/permission_denied = resource EXISTS, role lacks access (pre-auth anon).
   * "does not exist" / 42P01 / 42883 = resource truly absent.
   *
   * REMOVED: syncHealthState() call — was here previously and fired after every
   * check including cache hits, feeding into this.rpc() → recordFailure() loop.
   */
  async validateResource(name: string, type: 'function' | 'table' = 'table'): Promise<boolean> {
    const cacheKey = `${type}:${name}`;
    const cached = resourceCache.get(cacheKey);
    if (cached) {
      if (cached.expires > Date.now()) {
        stats.cacheHits++;
        return cached.exists;
      }
      resourceCache.delete(cacheKey); // evict stale entry immediately
    }

    lastValidation = new Date();
    try {
      let exists = false;
      if (type === 'table') {
        const { error } = await supabase
          .from(name as any)
          .select('count', { count: 'exact', head: true })
          .limit(0);
        if (!error) {
          exists = true;
        } else {
          const msg = (error.message ?? '').toLowerCase();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.rpc(name as any) as any).limit(0);
        if (!error) {
          exists = true;
        } else {
          const msg = (error.message ?? '').toLowerCase();
          const isPermissionError =
            msg.includes('permission denied') ||
            msg.includes('42501') ||
            msg.includes('jwt') ||
            msg.includes('unauthorized') ||
            msg.includes('invalid api key');
          const isNotFound =
            msg.includes('does not exist') || msg.includes('not found') || msg.includes('42883');
          // NOTE: msg.includes('function') intentionally removed — PostgREST returns
          // "could not find the function...() in the schema cache" for both missing
          // functions AND parameterized functions probed without args (PGRST202).
          // Only PG error 42883 is definitive evidence of a truly absent function.
          exists = isPermissionError || !isNotFound;
        }
      }
      resourceCache.set(cacheKey, { exists, expires: Date.now() + CACHE_TTL });
      if (resourceCache.size > CACHE_MAX_SIZE) pruneResourceCache();
      return exists;
    } catch {
      return false;
    }
  },

  /**
   * Sincroniza estado de saúde com o banco.
   *
   * CRITICAL FIX: Uses supabase.rpc() directly (NOT this.rpc()) to avoid the
   * recordFailure() → rpc() → recordFailure() infinite recursion cycle.
   * _healthLogInProgress guard prevents concurrent/recursive invocations.
   */
  async syncHealthState() {
    if (_healthLogInProgress) return;
    _healthLogInProgress = true;
    try {
      const telemetry = this.getTelemetry();
      let status: 'healthy' | 'degraded' | 'error' = 'healthy';
      if (telemetry.recentFailures.length > 10) status = 'error';
      else if (telemetry.recentFailures.length > 0) status = 'degraded';

      // Direct supabase.rpc() — NOT this.rpc() — prevents recursive calls
      // Destructure { error } so PostgREST logical errors (e.g. 403) are not silently discarded
      type RpcResult = { data: unknown; error: { message: string } | null };
      const { error: rpcErr } = await (supabase.rpc as unknown as (name: string, params?: unknown) => Promise<RpcResult>)(
        'rpc_update_email_health_state',
        {
          p_status: status,
          p_failure_count: telemetry.recentFailures.length,
          p_metadata: {
            total_calls: telemetry.stats.totalCalls,
            cache_hits: telemetry.stats.cacheHits,
            last_validation: lastValidation?.toISOString(),
          },
        }
      );
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const masked: any = Array.isArray(data) // ignore-audit: union array|object not narrowable without any
      ? [...(data as unknown[])]
      : { ...(data as Record<string, unknown>) };
    for (const key in masked) {
      const val = masked[key];
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('key') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('session') ||
        lowerKey.includes('cookie')
      ) {
        masked[key] = '***MASKED***';
      } else if (lowerKey.includes('email') && typeof val === 'string') {
        masked[key] = this.maskEmail(val);
      } else if (typeof val === 'object') {
        masked[key] = this.maskSensitiveData(val);
      }
    }
    return masked;
  },

  maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `***@${domain}`;
    return `${user.substring(0, 2)}***@${domain}`;
  },

  applyMasking(str: string): string {
    if (str.length > 30 && (str.includes('.') || /^[a-zA-Z0-9_-]+$/.test(str))) {
      return str.substring(0, 5) + '...' + str.substring(str.length - 5);
    }
    return str;
  },

  /**
   * Registra falha na telemetria.
   *
   * CRITICAL FIX: Previously called this.rpc('rpc_log_email_health') which
   * caused infinite recursion when RPC returned 403 (anon lacks EXECUTE):
   *   recordFailure() → this.rpc() error handler → recordFailure() → ...
   *
   * Fix: supabase.rpc() directly (no error-handler delegation back to
   * recordFailure) + _healthLogInProgress re-entrancy guard.
   */
  async recordFailure(requestId: string, operation: string, resource: string, error: string) {
    const record: FailureRecord = {
      requestId,
      operation,
      resource,
      error,
      timestamp: new Date().toISOString(),
    };
    recentFailures.unshift(record);
    if (recentFailures.length > MAX_FAILURES) recentFailures.pop();

    if (_healthLogInProgress) return;
    _healthLogInProgress = true;
    try {
      type RpcResult = { data: unknown; error: { message: string } | null };
      const { error: rpcErr } = await (supabase.rpc as unknown as (name: string, params?: unknown) => Promise<RpcResult>)(
        'rpc_log_email_health',
        {
          p_status: 'error',
          p_operation: operation,
          p_resource: resource,
          p_request_id: requestId,
          p_error_message: error,
          p_is_failure: true,
        }
      );
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

  getTelemetry() {
    return { lastValidation, recentFailures: [...recentFailures], stats: { ...stats } };
  },

  getCacheInfo() {
    const values = Array.from(resourceCache.values());
    const expiration = values.length > 0 ? Math.max(...values.map((v) => v.expires)) : null;
    return { expiration, size: resourceCache.size };
  },

  clearCache(prefix?: string) {
    if (!prefix) { resourceCache.clear(); return; }
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
