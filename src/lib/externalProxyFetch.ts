import { supabase, SUPABASE_RESOLVED_URL, SUPABASE_RESOLVED_ANON_KEY, isSupabaseConfigured } from '@/integrations/supabase/client';
import { type QueryOperation } from '@/lib/clientTelemetry';

// ─── Supabase function endpoint config ──────────────────────────────────────
/** S U P A B A S E_ U R L constant. */
export const SUPABASE_URL = SUPABASE_RESOLVED_URL;

/** S U P A B A S E_ A N O N constant. */
export const SUPABASE_ANON = SUPABASE_RESOLVED_ANON_KEY;

/** F U N C T I O N S_ B A S E constant. */
export const FUNCTIONS_BASE = isSupabaseConfigured ? `${SUPABASE_URL}/functions/v1` : '';

// ─── Per-attempt timeout ─────────────────────────────────────────────────────
// A função doente pode pendurar sem resposta (gateway/edge runtime travado).
// Sem timeout, cada tentativa do proxy ficaria bloqueada indefinidamente.
// 20s cobre consultas legítimas pesadas (o edge function timeout padrão é 30s)
// e aborta apenas hangs reais. O abort dispara `TimeoutError` (não retry —
// retry imediato contra função pendurada é inútil) e a telemetria registra
// severity 'timeout'.
const FETCH_TIMEOUT_MS = 20_000;

/** Compõe o signal do caller com um timeout de 20s via AbortController manual (sem depender de AbortSignal.timeout/any). */
function composeTimeoutSignal(callerSignal?: AbortSignal): {
  signal: AbortSignal | undefined;
  cleanup: () => void;
} {
  if (typeof AbortController === 'undefined') {
    return { signal: callerSignal, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Proxy request timed out', 'TimeoutError'));
  }, FETCH_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer);
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

// ─── Test-only invoke override ────────────────────────────────────────────────
/** Invoke Override Fn type alias. */
export type InvokeOverrideFn =
  | ((
      fnName: string,
      opts: { body: unknown; signal?: AbortSignal; headers?: Record<string, string> }
    ) => Promise<{
      data: unknown;
      error: { name?: string; message?: string; code?: string; status?: number } | null;
    }>)
  | null;

let _invokeOverride: InvokeOverrideFn = null;
/** Installs a test-only override for the Edge Function invoker, bypassing real HTTP calls. */
export const setInvokeOverride = (fn: InvokeOverrideFn): void => {
  _invokeOverride = fn;
};
/** Removes any active test-only invoker override, restoring normal HTTP fetch behaviour. */
export const clearInvokeOverride = (): void => {
  _invokeOverride = null;
};
/** Returns the currently active test-only invoker override, or null if none is installed. */
export const getInvokeOverride = (): InvokeOverrideFn => _invokeOverride;

// ─── Direct-fetch invoker ────────────────────────────────────────────────────
// The Lovable preview injects a fetch proxy that can drop POST bodies sent via
// supabase.functions.invoke(), surfacing as FunctionsFetchError with status:
// undefined. Calling the function URL directly with fetch bypasses that
// transport. We keep the SDK-style return shape so callers are unaffected.
/** Invokes a Supabase Edge Function directly via fetch, bypassing the SDK transport that can drop POST bodies in Lovable preview. Returns the same SDK-style `{data, error}` shape. */
export async function invokeViaFetch<T>(
  fnName: string,
  opts: { body: unknown; signal?: AbortSignal; headers?: Record<string, string> }
): Promise<{
  data: T | null;
  error: { name?: string; message?: string; code?: string; status?: number } | null;
}> {
  const _invokeOverride = getInvokeOverride();
  if (_invokeOverride) {
    return _invokeOverride(fnName, opts) as Promise<{
      data: T | null;
      error: { name?: string; message?: string; code?: string; status?: number } | null;
    }>;
  }
  if (!FUNCTIONS_BASE) {
    return { data: null, error: { name: 'ConfigError', message: 'VITE_SUPABASE_URL missing' } };
  }

  let authHeader: string | null = null;
  try {
    const { data, error: _error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) authHeader = `Bearer ${token}`;
  } catch {
    /* fall back to anon */
  }

  if (!authHeader) {
    return {
      data: null,
      error: {
        name: 'AuthSessionMissingError',
        message: 'Sessão ausente. Faça login novamente para consultar o proxy externo.',
        status: 401,
      },
    };
  }

  try {
    const { signal, cleanup } = composeTimeoutSignal(opts.signal);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON,
          Authorization: authHeader,
          ...(opts.headers ?? {}),
        },
        body: JSON.stringify(opts.body ?? {}),
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      if (!res.ok) {
        const msg =
          parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
            ? String((parsed as Record<string, unknown>).error)
            : `HTTP ${res.status}`;
        return {
          data: null,
          error: { name: 'FunctionsHttpError', message: msg, status: res.status },
        };
      }
      return { data: (parsed as T) ?? null, error: null };
    } finally {
      cleanup();
    }
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    return {
      data: null,
      error: { name: err.name ?? 'FunctionsFetchError', message: err.message ?? 'fetch_failed' },
    };
  }
}

// ─── Request body helpers ────────────────────────────────────────────────────
/** Infers and injects an `action` field into a proxy request body if none is set, defaulting to "select" for table queries and "rpc" for RPC calls. */
export function normalizeProxyBody(body: Record<string, unknown>): Record<string, unknown> {
  const action = typeof body.action === 'string' ? body.action : undefined;
  const hasTable = typeof body.table === 'string' && body.table.length > 0;
  const hasRpc = typeof body.rpc === 'string' && body.rpc.length > 0;
  if (action || (!hasTable && !hasRpc)) return body;
  if (hasRpc) return { ...body, action: 'rpc' };
  return { ...body, action: 'select' };
}

/** Extracts telemetry metadata (operation type, target table/RPC, limit, offset, filters) from a proxy request body for clientTelemetry instrumentation. */
export function deriveTelemetryMeta(body: Record<string, unknown>): {
  operation: QueryOperation;
  target: string;
  limit: number | null;
  offset: number | null;
  filters: Record<string, unknown> | null;
} {
  const action = body.action as string | undefined;
  let operation: QueryOperation = 'select';
  if (action === 'rpc') operation = 'rpc';
  else if (action === 'insert') operation = 'insert';
  else if (action === 'update') operation = 'update';
  else if (action === 'delete') operation = 'delete';

  const target =
    (body.rpc as string | undefined) ?? (body.table as string | undefined) ?? 'unknown';
  const limit = typeof body.limit === 'number' ? body.limit : null;
  const offset = typeof body.offset === 'number' ? body.offset : null;

  let filters: Record<string, unknown> | null = null;
  if (body.filters) filters = { filters: body.filters };
  else if (body.match) filters = { match: body.match };
  else if (body.params) filters = body.params as Record<string, unknown>;
  else if (body.cursor) filters = { cursor: body.cursor };

  return { operation, target, limit, offset, filters };
}

// ─── Error classification ────────────────────────────────────────────────────
/** Normalized Error type alias. */
export type NormalizedError = {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
};

/** Normalises an unknown error thrown by invokeViaFetch into a NormalizedError with name, message, code, and status fields. */
export function normalizeInvokeError(err: unknown): NormalizedError {
  if (!err || typeof err !== 'object') {
    return { message: typeof err === 'string' ? err : String(err) };
  }
  const e = err as {
    name?: string;
    message?: string;
    code?: string;
    status?: number;
    context?: { status?: number };
  };
  return { name: e.name, message: e.message, code: e.code, status: e.status ?? e.context?.status };
}

/** Returns true when the error indicates a persistent 502 config/auth rejection (e.g. invalid JWT_SECRET or self-hosted service_role rejection). These errors will not resolve on retry. */
export function isPersistentConfigAuthError(err: unknown): boolean {
  const { status, message = '' } = normalizeInvokeError(err);
  return (
    status === 502 &&
    /service_role|self-hosted rejeitou|assinatura inv[aá]lida|JWT_SECRET/i.test(message)
  );
}

/** Returns true when the error is a transient Edge Runtime or gateway failure (5xx, SUPABASE_EDGE_RUNTIME_ERROR) that is safe to retry. Persistent config/auth errors are excluded. */
export function isTransientRuntimeError(err: unknown): boolean {
  if (isPersistentConfigAuthError(err)) return false;
  const { message = '', code = '', status } = normalizeInvokeError(err);
  return (
    /SUPABASE_EDGE_RUNTIME_ERROR/i.test(code) ||
    /SUPABASE_EDGE_RUNTIME_ERROR/i.test(message) ||
    /temporarily unavailable/i.test(message) ||
    /non-2xx status code/i.test(message) ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /\b503\b/.test(message) ||
    /\b502\b/.test(message) ||
    /\b504\b/.test(message)
  );
}

/**
 * Returns true when the error indicates DEGRADED BACKEND HEALTH: HTTP 5xx,
 * pool de conexões esgotado ou erro de conexão com o banco. Essas falhas não
 * se resolvem com retry imediato — devem contar para o health circuit breaker
 * (3 falhas em 30s → short-circuit de 60s) para não martelar a função doente.
 * Casos vistos em produção (2026-07-31):
 *   - HTTP 500 "Timed out acquiring connection from connection pool."
 *   - HTTP 400 "Database connection error. Retrying the connection."
 */
export function isServerHealthError(err: unknown): boolean {
  const { status, message = '' } = normalizeInvokeError(err);
  const m = message.toLowerCase();
  if (status !== undefined && status >= 500) return true;
  if (
    /timed out acquiring connection|connection pool|database connection error|retrying the connection|pool exhausted|no more connections|too many clients/i.test(
      m
    )
  ) {
    return true;
  }
  if (
    status !== undefined &&
    (status === 400 || status === 429) &&
    /pool|database|connection|timeout|temporarily unavailable/i.test(m)
  ) {
    return true;
  }
  return false;
}
