/**
 * Client helper for calling the external-db-proxy edge function.
 *
 * Every call is timed, tagged with a correlationId and recorded via
 * `clientTelemetry` so DevTools and the telemetry panel can inspect
 * duration, limit, filters, recordCount, severity and trace id in one
 * place. The same correlationId is propagated to the edge function via
 * the `x-correlation-id` header AND echoed in the JSON body as `__cid`
 * (Supabase Functions client does not always forward custom headers
 * to the underlying request, so the body field is the reliable channel).
 */
import { supabase } from '@/integrations/supabase/client';
import {
  recordQueryEvent,
  recordRetryOutcome,
  classifySeverity,
  type QueryOperation,
} from '@/lib/clientTelemetry';
import { generateCorrelationId, CORRELATION_HEADER } from '@/lib/correlationId';
import { getLogger } from '@/lib/logger';

const proxyLog = getLogger('externalProxy');

// ─── Direct-fetch invoker ─────────────────────────────────────────────
// The Lovable preview injects a `lovable.js` fetch proxy that occasionally
// drops POST bodies sent through `supabase.functions.invoke()`, surfacing as
// `FunctionsFetchError: Failed to send a request to the Edge Function` with
// `status: undefined`. Calling the function URL directly with `fetch` bypasses
// that proxied transport. We keep the SDK-style return shape so the rest of
// executeProxyCall (retry, breaker, telemetry) is untouched.
const SUPABASE_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const FUNCTIONS_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : '';

// Test-only override hook — when set, replaces the real fetch invoker so
// existing unit tests that mocked `supabase.functions.invoke` keep working.
let __invokeOverride:
  | ((
      fnName: string,
      opts: { body: unknown; signal?: AbortSignal; headers?: Record<string, string> }
    ) => Promise<{
      data: unknown;
      error: { name?: string; message?: string; code?: string; status?: number } | null;
    }>)
  | null = null;

async function invokeViaFetch<T>(
  fnName: string,
  opts: { body: unknown; signal?: AbortSignal; headers?: Record<string, string> }
): Promise<{
  data: T | null;
  error: { name?: string; message?: string; code?: string; status?: number } | null;
}> {
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
      error: {
        name: err.name ?? 'FunctionsFetchError',
        message: err.message ?? 'fetch_failed',
      },
    };
  }
}

interface ProxySelectParams {
  table: string;
  select?: string;
  filters?: { column: string; operator: string; value: unknown }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
  /**
   * Optional cursor sugar — pushed into `filters` server-side.
   * Use for pagination by created_at (gt for forward, lt for older).
   */
  cursor?: { column: string; operator: 'gt' | 'lt' | 'gte' | 'lte'; value: string };
  /** Optional AbortSignal — cancels the underlying fetch. */
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

function normalizeProxyBody(body: Record<string, unknown>): Record<string, unknown> {
  const action = typeof body.action === 'string' ? body.action : undefined;
  const hasTable = typeof body.table === 'string' && body.table.length > 0;
  const hasRpc = typeof body.rpc === 'string' && body.rpc.length > 0;

  if (action || (!hasTable && !hasRpc)) return body;
  if (hasRpc) return { ...body, action: 'rpc' };
  return { ...body, action: 'select' };
}

function deriveTelemetryMeta(body: Record<string, unknown>): {
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

// ─── Request coalescing ──────────────────────────────────────────────
// Many components mount in parallel and hit the same proxy endpoint within
// a few ms (sidebar + crossTab + queryFn etc). Without coalescing this
// causes a stampede that the edge runtime cannot absorb (we observed 40+
// OPTIONS preflights with zero POST completions). We dedupe by a stable
// signature of the request body for a short window and return the same
// in-flight Promise to all callers.
const COALESCE_WINDOW_MS = 250;
const inflight = new Map<string, { promise: Promise<ProxyResponse<unknown>>; expiresAt: number }>();

function coalesceKey(body: Record<string, unknown>): string | null {
  // Mutations must NEVER be coalesced — two identical inserts are two real
  // operations. Only SELECT and read-only RPCs are eligible.
  const action = body.action as string | undefined;
  if (action === 'insert' || action === 'update' || action === 'delete') return null;
  try {
    // Stable key: action + table/rpc + filters/match/params + limit + offset.
    // We intentionally drop __cid and signal — they don't change the result.
    const { __cid, signal, ...stable } = body as Record<string, unknown> & {
      __cid?: string;
      signal?: unknown;
    };
    void __cid;
    void signal;
    return JSON.stringify(stable);
  } catch {
    return null;
  }
}

// ─── Per-target circuit breaker ──────────────────────────────────────
// After N consecutive ghost-POST failures (FunctionsFetchError without a
// status code — the request never made it to the server), the breaker
// trips for COOLDOWN_MS so we stop bombarding an already-overloaded edge.
// Closes automatically on the first successful response after cooldown.
const BREAKER_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 5_000;
const breaker = new Map<string, { fails: number; openedAt: number }>();

// Session-wide auth breaker: after we see a hard 401/403 from the proxy we
// stop hammering the endpoint for the rest of the session. All targets share
// this lock because the token is global.
let authLockUntil = 0;
const AUTH_LOCK_MS = 60_000;
// Persistent config-auth errors (502 with "service_role rejected") won't be
// fixed by retrying — hold requests for 5 minutes to give the operator time
// to rotate the secret without flooding telemetry.
const CONFIG_LOCK_MS = 5 * 60_000;

function isAuthLocked(): number {
  const now = Date.now();
  return authLockUntil > now ? authLockUntil - now : 0;
}

function tripAuthLock(cooldownMs: number = AUTH_LOCK_MS, reason: string = 'auth'): void {
  authLockUntil = Math.max(authLockUntil, Date.now() + cooldownMs);
  proxyLog.warn('proxy auth lock tripped', { cooldownMs, reason });
}

function isBreakerOpen(target: string): { open: boolean; remainingMs: number } {
  const entry = breaker.get(target);
  if (!entry || entry.fails < BREAKER_THRESHOLD) return { open: false, remainingMs: 0 };
  const elapsed = Date.now() - entry.openedAt;
  if (elapsed >= BREAKER_COOLDOWN_MS) {
    breaker.delete(target);
    return { open: false, remainingMs: 0 };
  }
  return { open: true, remainingMs: BREAKER_COOLDOWN_MS - elapsed };
}

function recordBreakerFailure(target: string): void {
  const cur = breaker.get(target) ?? { fails: 0, openedAt: 0 };
  cur.fails += 1;
  if (cur.fails >= BREAKER_THRESHOLD && cur.openedAt === 0) {
    cur.openedAt = Date.now();
    proxyLog.warn('proxy circuit opened', {
      target,
      fails: cur.fails,
      cooldownMs: BREAKER_COOLDOWN_MS,
    });
  }
  breaker.set(target, cur);
}

function recordBreakerSuccess(target: string): void {
  if (breaker.has(target)) {
    proxyLog.info('proxy circuit closed', { target });
    breaker.delete(target);
  }
  authLockUntil = 0;
}

// Test-only reset hook — exported via __testing namespace below.
function __resetBreakerAndCoalesce(): void {
  breaker.clear();
  inflight.clear();
  authLockUntil = 0;
}

export async function queryExternalProxy<T = unknown>(
  params: ProxyParams
): Promise<ProxyResponse<T>> {
  // Extract signal so it isn't sent in the JSON body.
  const { signal, ...rawBody } = params as ProxyParams & { signal?: AbortSignal };
  const body = normalizeProxyBody(rawBody as Record<string, unknown>);
  const meta = deriveTelemetryMeta(body);

  // ── Session auth lock ──
  // If a previous call returned 401/403, short-circuit for AUTH_LOCK_MS so we
  // don't flood the edge with doomed requests until the user re-authenticates.
  const authRemaining = isAuthLocked();
  if (authRemaining > 0) {
    throw new Error(
      `Proxy auth locked (retry in ${authRemaining}ms) — sessão inválida, faça login novamente`
    );
  }

  // ── Circuit breaker check ──
  const breakerState = isBreakerOpen(meta.target);
  if (breakerState.open) {
    proxyLog.warn('proxy circuit short-circuit', {
      target: meta.target,
      remainingMs: breakerState.remainingMs,
    });
    const startedAt = performance.now();
    recordQueryEvent({
      ...meta,
      source: 'externalProxy',
      durationMs: 0,
      recordCount: null,
      errorMessage: `circuit_open:${meta.target}`,
      severity: 'error',
      startedAt,
      correlationId: 'circuit',
    });
    throw new Error(
      `Proxy circuit open for ${meta.target} (retry in ${breakerState.remainingMs}ms)`
    );
  }

  // ── Request coalescing ──
  // Two identical reads issued within COALESCE_WINDOW_MS share a single
  // in-flight Promise. Mutations are never coalesced (coalesceKey returns
  // null) so we never silently drop writes. The signal is honoured by the
  // caller separately — even if a coalesced caller aborts, the underlying
  // promise keeps running for the other waiters.
  const dedupeKey = coalesceKey(body as Record<string, unknown>);
  if (dedupeKey) {
    const existing = inflight.get(dedupeKey);
    if (existing && existing.expiresAt > Date.now()) {
      proxyLog.debug('proxy request coalesced', { target: meta.target });
      return existing.promise as Promise<ProxyResponse<T>>;
    }
  }

  const exec = executeProxyCall<T>(body as Record<string, unknown>, signal, meta);

  if (dedupeKey) {
    inflight.set(dedupeKey, {
      promise: exec as Promise<ProxyResponse<unknown>>,
      expiresAt: Date.now() + COALESCE_WINDOW_MS,
    });
    // Best-effort cleanup once the promise settles, so we never leak entries
    // beyond their natural lifetime.
    const cleanup = () => {
      const cur = inflight.get(dedupeKey);
      if (cur && cur.promise === (exec as unknown as Promise<ProxyResponse<unknown>>)) {
        inflight.delete(dedupeKey);
      }
    };
    exec.then(cleanup, cleanup);
  }

  return exec;
}

async function executeProxyCall<T>(
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  meta: ReturnType<typeof deriveTelemetryMeta>
): Promise<ProxyResponse<T>> {
  const correlationId = generateCorrelationId();
  // Echo the trace id in the body so the edge function can log it even when
  // headers are stripped by intermediate layers.
  const bodyWithCid: Record<string, unknown> = { ...body, __cid: correlationId };

  const invokeOptions: { body: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {
    body: bodyWithCid,
    headers: { [CORRELATION_HEADER]: correlationId },
  };
  if (signal) invokeOptions.signal = signal;

  const startedAt = performance.now();

  // Transient 503 retry: the Supabase Edge runtime occasionally fails to spin
  // up an isolate (cold start) and returns SUPABASE_EDGE_RUNTIME_ERROR /
  // "non-2xx status code". These are not real failures — a quick retry usually
  // succeeds. We retry up to 2 times with small exponential backoff, but never
  // for AbortError (caller-initiated cancellation).
  const normalizeInvokeError = (
    err: unknown
  ): { name?: string; message?: string; code?: string; status?: number } => {
    if (!err || typeof err !== 'object') {
      return { message: typeof err === 'string' ? err : String(err) };
    }
    const maybeError = err as {
      name?: string;
      message?: string;
      code?: string;
      status?: number;
      context?: { status?: number };
    };
    return {
      name: maybeError.name,
      message: maybeError.message,
      code: maybeError.code,
      status: maybeError.status ?? maybeError.context?.status,
    };
  };

  // 502 with a config-auth hint from the proxy is NOT transient — retrying
  // won't fix a mismatched service_role key. Detect and short-circuit.
  const isPersistentConfigAuthError = (err: unknown): boolean => {
    const normalized = normalizeInvokeError(err);
    const message = normalized.message ?? '';
    return (
      normalized.status === 502 &&
      /service_role|self-hosted rejeitou|assinatura inv[aá]lida|JWT_SECRET/i.test(message)
    );
  };

  const isTransientRuntimeError = (err: unknown): boolean => {
    // Persistent config-auth 502s are never transient — bail out early.
    if (isPersistentConfigAuthError(err)) return false;
    const normalized = normalizeInvokeError(err);
    const message = normalized.message ?? '';
    const code = normalized.code ?? '';
    const status = normalized.status;
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
  };

  try {
    let data: ProxyResponse<T> | null = null;
    let error: { name?: string; message?: string; code?: string; status?: number } | null = null;
    const MAX_ATTEMPTS = 3;
    let attemptsMade = 0;
    let transientCount = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      attemptsMade = attempt;
      const attemptStartedAt = performance.now();
      // NOTE: do NOT add custom headers here. The edge function's CORS allowlist
      // only includes `authorization, x-client-info, apikey, content-type,
      // x-correlation-id`. Any other header (e.g. an old `x-attempt`) makes the
      // browser preflight fail with `TypeError: Failed to fetch`. We pass the
      // attempt number through the body instead.
      const perAttemptOptions = {
        ...invokeOptions,
        body: { ...(invokeOptions.body as Record<string, unknown>), __attempt: attempt },
      };
      try {
        const result = __invokeOverride
          ? ((await __invokeOverride('external-db-proxy', perAttemptOptions)) as {
              data: ProxyResponse<T> | null;
              error: { name?: string; message?: string; code?: string; status?: number } | null;
            })
          : await invokeViaFetch<ProxyResponse<T>>('external-db-proxy', perAttemptOptions);
        data = result.data as ProxyResponse<T> | null;
        error = result.error ? normalizeInvokeError(result.error) : null;
        // Edge runtime guard: when the function crashes at boot/runtime the
        // outer wrapper returns HTTP 200 with `{ fallback: true, code: ... }`.
        // The SDK can't surface that as `result.error`, so we promote it
        // here so the retry + breaker logic kicks in instead of letting
        // callers consume a malformed payload.
        if (
          !error &&
          data &&
          typeof data === 'object' &&
          (data as { fallback?: boolean }).fallback === true
        ) {
          const d = data as { code?: string; message?: string; detail?: string };
          error = {
            name: 'FunctionsFetchError',
            code: d.code ?? 'SUPABASE_EDGE_RUNTIME_ERROR',
            message: d.message ?? d.detail ?? 'Service is temporarily unavailable',
            status: undefined,
          };
          data = null;
        }
      } catch (invokeErr) {
        data = null;
        error = normalizeInvokeError(invokeErr);
      }
      const attemptDurationMs = Math.round(performance.now() - attemptStartedAt);

      const ok = !error;
      // "Ghost POST": OPTIONS preflight succeeded but the POST never reached
      // the edge runtime. Surface as `errorName: FunctionsFetchError` with
      // status === undefined. We treat these as transient (worth retrying)
      // AND count them toward the circuit breaker.
      const isGhostPost =
        !ok &&
        (error?.name === 'FunctionsFetchError' ||
          /Failed to send a request/i.test(error?.message ?? '')) &&
        error?.status === undefined;
      const isAuthError = !ok && (error?.status === 401 || error?.status === 403);
      const isConfigAuthError = !ok && isPersistentConfigAuthError(error);
      const transient = error ? isTransientRuntimeError(error) || isGhostPost : false;
      if (transient) transientCount += 1;
      if (isGhostPost) recordBreakerFailure(meta.target);
      if (isAuthError) tripAuthLock(AUTH_LOCK_MS, 'auth_401_403');
      if (isConfigAuthError) tripAuthLock(CONFIG_LOCK_MS, 'config_service_role_mismatch');
      if (ok) recordBreakerSuccess(meta.target);

      const isAbort = error?.name === 'AbortError';
      const willRetry = !ok && !isAbort && transient && attempt < MAX_ATTEMPTS;
      // Exponential backoff with jitter — fixed short delays were piling
      // retries on top of the original stampede. Range per attempt:
      //   attempt 1 → 200..300ms
      //   attempt 2 → 400..600ms
      //   attempt 3 → 800..1200ms
      const backoffBase = 200 * Math.pow(2, attempt - 1);
      const backoffMs = willRetry
        ? backoffBase + Math.floor(Math.random() * (backoffBase * 0.5))
        : 0;

      const attemptMeta = {
        cid: correlationId,
        target: meta.target,
        operation: meta.operation,
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        attemptDurationMs,
        ok,
        errorName: error?.code ?? error?.name,
        errorMessage: error?.message,
        status: error?.status,
        transient,
        ghostPost: isGhostPost,
        willRetry,
        backoffMs,
      };
      if (ok) {
        if (attempt > 1) {
          proxyLog.info('proxy attempt succeeded after retry', attemptMeta);
        } else {
          proxyLog.debug('proxy attempt ok', attemptMeta);
        }
      } else {
        proxyLog.warn('proxy attempt failed', attemptMeta);
      }

      if (ok) break;
      if (isAbort) break;
      if (!transient) break;
      if (attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, backoffMs));
    }

    const finalSuccess = !error;
    const recovered = finalSuccess && attemptsMade > 1;
    const exhausted = !finalSuccess && attemptsMade === MAX_ATTEMPTS && transientCount > 0;

    recordRetryOutcome({
      target: meta.target,
      attempts: attemptsMade,
      recovered,
      exhausted,
      transientCount,
      correlationId,
    });

    if (recovered) {
      proxyLog.info('proxy recovered after retry', {
        cid: correlationId,
        target: meta.target,
        attempts: attemptsMade,
        transientCount,
      });
    } else if (exhausted) {
      proxyLog.error('proxy retry exhausted', {
        cid: correlationId,
        target: meta.target,
        attempts: attemptsMade,
        transientCount,
        lastError: error?.message,
      });
    }

    if (error) {
      const name = (error as { name?: string }).name;
      const message = error.message || '';
      const isAbort = name === 'AbortError' || /aborted/i.test(message);
      const isTimeout = name === 'TimeoutError' || /timeout/i.test(message);
      const durationMs = Math.round(performance.now() - startedAt);

      recordQueryEvent({
        ...meta,
        source: 'externalProxy',
        durationMs,
        recordCount: null,
        errorMessage: message || 'External DB proxy error',
        severity: isTimeout ? 'timeout' : 'error',
        startedAt,
        correlationId,
      });

      if (isAbort) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      throw new Error(
        message
          ? `[cid=${correlationId}] ${message}`
          : `[cid=${correlationId}] External DB proxy error`
      );
    }

    if (data?.error) {
      const durationMs = Math.round(performance.now() - startedAt);
      recordQueryEvent({
        ...meta,
        source: 'externalProxy',
        durationMs,
        recordCount: null,
        errorMessage: data.error,
        severity: classifySeverity(durationMs, true, false),
        startedAt,
        correlationId,
      });
      throw new Error(data.error);
    }

    const durationMs = Math.round(performance.now() - startedAt);
    const recordCount = Array.isArray(data?.data) ? data.data.length : null;
    recordQueryEvent({
      ...meta,
      source: 'externalProxy',
      durationMs,
      recordCount,
      startedAt,
      correlationId,
    });

    return data as ProxyResponse<T>;
  } catch (err) {
    const name = (err as Error)?.name;
    const message = (err as Error)?.message ?? '';
    if (name === 'AbortError') throw err;

    // Only record if this looks like an unexpected throw (not already recorded).
    if (!/External DB proxy error|Aborted/i.test(message)) {
      const durationMs = Math.round(performance.now() - startedAt);
      const isTimeout = name === 'TimeoutError' || /timeout/i.test(message);
      recordQueryEvent({
        ...meta,
        source: 'externalProxy',
        durationMs,
        recordCount: null,
        errorMessage: message || 'unknown',
        severity: isTimeout ? 'timeout' : 'error',
        startedAt,
        correlationId,
      });
    }
    throw err;
  }
}

// Test-only namespace. Not part of the public API. Used by unit tests to
// reset the per-target circuit breaker and the in-flight coalesce map
// between cases without exporting the internals individually.
export const __testing = {
  resetBreakerAndCoalesce: __resetBreakerAndCoalesce,
  isBreakerOpen: (target: string) => isBreakerOpen(target),
  setInvokeOverride: (fn: typeof __invokeOverride) => {
    __invokeOverride = fn;
  },
  clearInvokeOverride: () => {
    __invokeOverride = null;
  },
};
