import { supabase } from '@/integrations/supabase/client';
import { type QueryOperation } from '@/lib/clientTelemetry';

// ─── Supabase function endpoint config ──────────────────────────────────────
export const SUPABASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
export const FUNCTIONS_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : '';

// ─── Test-only invoke override ────────────────────────────────────────────────
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
export const setInvokeOverride = (fn: InvokeOverrideFn): void => {
  _invokeOverride = fn;
};
export const clearInvokeOverride = (): void => {
  _invokeOverride = null;
};
export const getInvokeOverride = (): InvokeOverrideFn => _invokeOverride;

// ─── Direct-fetch invoker ────────────────────────────────────────────────────
// The Lovable preview injects a fetch proxy that can drop POST bodies sent via
// supabase.functions.invoke(), surfacing as FunctionsFetchError with status:
// undefined. Calling the function URL directly with fetch bypasses that
// transport. We keep the SDK-style return shape so callers are unaffected.
export async function invokeViaFetch<T>(
  fnName: string,
  opts: { body: unknown; signal?: AbortSignal; headers?: Record<string, string> }
): Promise<{
  data: T | null;
  error: { name?: string; message?: string; code?: string; status?: number } | null;
}> {
  if (getInvokeOverride()) {
    return getInvokeOverride()!(fnName, opts) as Promise<{
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
    const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, {
      method: 'POST',
      signal: opts.signal,
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
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    return {
      data: null,
      error: { name: err.name ?? 'FunctionsFetchError', message: err.message ?? 'fetch_failed' },
    };
  }
}

// ─── Request body helpers ────────────────────────────────────────────────────
export function normalizeProxyBody(body: Record<string, unknown>): Record<string, unknown> {
  const action = typeof body.action === 'string' ? body.action : undefined;
  const hasTable = typeof body.table === 'string' && body.table.length > 0;
  const hasRpc = typeof body.rpc === 'string' && body.rpc.length > 0;
  if (action || (!hasTable && !hasRpc)) return body;
  if (hasRpc) return { ...body, action: 'rpc' };
  return { ...body, action: 'select' };
}

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
export type NormalizedError = {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
};

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

export function isPersistentConfigAuthError(err: unknown): boolean {
  const { status, message = '' } = normalizeInvokeError(err);
  return (
    status === 502 &&
    /service_role|self-hosted rejeitou|assinatura inv[aá]lida|JWT_SECRET/i.test(message)
  );
}

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
