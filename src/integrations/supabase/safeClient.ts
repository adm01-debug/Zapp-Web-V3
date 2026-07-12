// @ts-nocheck
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

// Supabase query builders expose `.single()` at runtime but the PromiseLike
// interface we use for `AnyQueryResult` does not declare it. This intersection
// lets executeSingle call `.single()` without an `as any` escape hatch.
type AnyQueryBuilderResult = AnyQueryResult & { single?: () => AnyQueryResult };

// Dynamic table accessor — bypasses the overloaded `from()` signature that
// requires a string-literal table name from the generated types, while
// preserving the runtime type we actually use downstream.
type DynamicSupabaseClient = { from(t: string): ReturnType<typeof supabase.from> };

// Permissive query-builder shape usada nos callbacks de `safeClient.from`.
// Precisamos decouplar do `ReturnType<typeof supabase.from>` porque o cliente
// tipado do Supabase gera uma união gigante por nome de tabela — quando o
// caller usa uma tabela ausente em `types.ts` (ex.: views/`_safe`) o compilador
// entra em recursão TS2589. Este alias mantém IntelliSense básico sem cascatear.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SafeQueryBuilder = any;


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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).then(
    (result) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      return result as T;
    },
    (err) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      throw err;
    }
  );
}

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return '***@' + (local || '');
  const masked = local.length > 2 ? local.slice(0, 2) + '***' : '***';
  return `${masked}@${domain}`;
};

export const maskSensitiveData = (
  data: Record<string, unknown> | unknown[]
): Record<string, unknown> | unknown[] => {
  const SENSITIVE_KEYS = new Set([
    'password',
    'senha',
    'secret',
    'token',
    'api_key',
    'apikey',
    'api-key',
    'access_token',
    'refresh_token',
    'private_key',
    'auth_token',
    'authorization',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
    'bearer',
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
    d: Record<string, unknown> | unknown[] | null | undefined
  ): Record<string, unknown> | unknown[] => {
    if (Array.isArray(d)) return d.map((item) => maskAny(item as Record<string, unknown>));
    if (!d || typeof d !== 'object') return {} as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(d as Record<string, unknown>).map(([k, v]) => [k, maskValue(k, v)])
    );
  };

  return maskAny(data);
};

async function executeQuery<T>(
  operation: string,
  table: string,
  callback: (q: ReturnType<typeof supabase.from>) => AnyQueryResult
): Promise<SafeResponse<T>> {
  const requestId = generateRequestId();
  telemetry.stats.totalCalls++;
  try {
    const q = (supabase as unknown as DynamicSupabaseClient).from(table);
    const result = await withTimeout(
      Promise.resolve(callback(q)) as Promise<{ data: unknown; error: PostgrestError | null }>,
      REQUEST_TIMEOUT_MS
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

async function executeSingle<T>(
  table: string,
  callback: (q: ReturnType<typeof supabase.from>) => AnyQueryResult
): Promise<SafeResponse<T>> {
  return executeQuery<T>('single', table, (q) => {
    const query = callback(q) as AnyQueryBuilderResult;
    return typeof query.single === 'function' ? query.single() : query;
  });
}

async function executeFrom<T>(
  table: string,
  callback: (q: ReturnType<typeof supabase.from>) => AnyQueryResult
): Promise<SafeResponse<T[]>> {
  const result = await executeQuery<T[]>('from', table, callback);
  return result;
}

async function executeRpc<T = unknown>(
  fn: string,
  params?: Record<string, unknown>
): Promise<SafeResponse<T>> {
  const requestId = generateRequestId();
  telemetry.stats.totalCalls++;
  try {
    const result = await withTimeout(
      (
        supabase.rpc as unknown as (
          name: string,
          params?: Record<string, unknown>
        ) => Promise<{ data: unknown; error: PostgrestError | null }>
      )(fn, params),
      REQUEST_TIMEOUT_MS
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

async function invokeFunction<T = unknown>(fn: string, body?: unknown): Promise<SafeResponse<T>> {
  const requestId = generateRequestId();
  telemetry.stats.totalCalls++;
  try {
    const result = await withTimeout(supabase.functions.invoke(fn, { body }), REQUEST_TIMEOUT_MS);
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

function getTelemetry(): ClientTelemetry {
  return { ...telemetry, recentFailures: [...telemetry.recentFailures] };
}

function getCacheInfo(): CacheInfo {
  return { ...cache };
}

export const safeClient = {
  from: executeFrom,
  single: executeSingle,
  rpc: executeRpc,
  invoke: invokeFunction,
  maskSensitiveData,
  maskEmail,
  getTelemetry,
  getCacheInfo,
};