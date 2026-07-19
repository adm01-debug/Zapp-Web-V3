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
import { recordQueryEvent, recordRetryOutcome, classifySeverity } from '@/lib/clientTelemetry';
import { generateCorrelationId, CORRELATION_HEADER } from '@/lib/correlationId';
import { getLogger } from '@/lib/logger';
import {
  isBreakerOpen,
  recordBreakerFailure,
  recordBreakerSuccess,
  isAuthLocked,
  isConfigAuthLocked,
  tripAuthLock,
  tripConfigAuthLock,
  AUTH_LOCK_MS,
  coalesceKey,
  COALESCE_WINDOW_MS,
  inflight,
  resetBreakerState,
} from './externalProxyBreaker';
import {
  invokeViaFetch,
  normalizeProxyBody,
  deriveTelemetryMeta,
  normalizeInvokeError,
  isPersistentConfigAuthError,
  isTransientRuntimeError,
  setInvokeOverride,
  clearInvokeOverride,
  type InvokeOverrideFn,
} from './externalProxyFetch';

const proxyLog = getLogger('externalProxy');

// ─── Param interfaces ────────────────────────────────────────────────────────
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

// ─── Public entry point ──────────────────────────────────────────────────────
/** query External Proxy function. */
export async function queryExternalProxy<T = unknown>(
  params: ProxyParams
): Promise<ProxyResponse<T>> {
  const { signal, ...rawBody } = params as ProxyParams & { signal?: AbortSignal };
  const body = normalizeProxyBody(rawBody as Record<string, unknown>);
  const meta = deriveTelemetryMeta(body);

  const configRemaining = isConfigAuthLocked();
  if (configRemaining > 0) {
    throw new Error(
      `Proxy config-auth locked (session-wide, retry in ${configRemaining}ms) — service_role secret inválido`
    );
  }

  const authRemaining = isAuthLocked(meta.target);
  if (authRemaining > 0) {
    throw new Error(
      `Proxy auth locked for ${meta.target} (retry in ${authRemaining}ms) — sessão inválida, faça login novamente`
    );
  }

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
      promise: exec as Promise<unknown>,
      expiresAt: Date.now() + COALESCE_WINDOW_MS,
    });
    const cleanup = () => {
      const cur = inflight.get(dedupeKey);
      if (cur && cur.promise === (exec as unknown as Promise<unknown>)) {
        inflight.delete(dedupeKey);
      }
    };
    exec.then(cleanup, cleanup);
  }

  return exec;
}

// ─── Retry + telemetry core ──────────────────────────────────────────────────
async function executeProxyCall<T>(
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  meta: ReturnType<typeof deriveTelemetryMeta>
): Promise<ProxyResponse<T>> {
  const correlationId = generateCorrelationId();
  const bodyWithCid: Record<string, unknown> = { ...body, __cid: correlationId };
  const invokeOptions: { body: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {
    body: bodyWithCid,
    headers: { [CORRELATION_HEADER]: correlationId },
  };
  if (signal) invokeOptions.signal = signal;

  const startedAt = performance.now();

  try {
    const MAX_ATTEMPTS = 3;
    let data: ProxyResponse<T> | null = null;
    let error: ReturnType<typeof normalizeInvokeError> | null = null;
    let attemptsMade = 0;
    let transientCount = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      attemptsMade = attempt;
      const attemptStartedAt = performance.now();
      const perAttemptOptions = {
        ...invokeOptions,
        body: { ...(invokeOptions.body as Record<string, unknown>), __attempt: attempt },
      };

      try {
        const result = await invokeViaFetch<ProxyResponse<T>>(
          'external-db-proxy',
          perAttemptOptions
        );
        data = result.data as ProxyResponse<T> | null; // ignore-audit: narrows Supabase query result to local interface
        error = result.error ? normalizeInvokeError(result.error) : null;

        if (!error && data && (data as { fallback?: boolean }).fallback === true) {
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
      if (isAuthError) tripAuthLock(meta.target, AUTH_LOCK_MS, 'auth_401_403');
      if (isConfigAuthError) tripConfigAuthLock('config_service_role_mismatch');
      if (ok) recordBreakerSuccess(meta.target);

      const isAbort = error?.name === 'AbortError';
      const willRetry = !ok && !isAbort && transient && attempt < MAX_ATTEMPTS;
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
        if (attempt > 1) proxyLog.info('proxy attempt succeeded after retry', attemptMeta);
        else proxyLog.debug('proxy attempt ok', attemptMeta);
      } else {
        proxyLog.warn('proxy attempt failed', attemptMeta);
      }

      if (ok || isAbort || !transient || attempt === MAX_ATTEMPTS) break;
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
      const name = error.name;
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

    return data as ProxyResponse<T>; // ignore-audit: narrows Supabase query result to local interface
  } catch (err) {
    const name = (err as Error)?.name;
    const message = (err as Error)?.message ?? '';
    if (name === 'AbortError') throw err;

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

// ─── Test-only namespace ─────────────────────────────────────────────────────
/**
 * Guarded behind !import.meta.env.PROD: tree-shaken in production builds.
 * NEVER import __testing in production application code.
 */
export const __testing = !import.meta.env.PROD
  ? {
      resetBreakerAndCoalesce: resetBreakerState,
      isBreakerOpen: (target: string) => isBreakerOpen(target),
      setInvokeOverride: (fn: InvokeOverrideFn) => setInvokeOverride(fn),
      clearInvokeOverride: () => clearInvokeOverride(),
    }
  : undefined;
