import { useState, useCallback, useRef, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { normalizeIdempotencyKey, deriveIdempotencyKey } from '@/lib/idempotency';
import { loadRetryConfig, getRetryConfigSync } from '@/lib/retryConfig';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CallApiOptions {
  method?: HttpMethod;
  /** Max attempts including the first one. Default: 3 for idempotent verbs, 1 for POST unless `idempotencyKey` is set. */
  retries?: number;
  /** Milliseconds for the first backoff. Default: 250ms; doubles each attempt. */
  baseBackoffMs?: number;
  /** Overall per-request timeout. Default: 30s. */
  timeoutMs?: number;
  /** When present, POST requests become retriable and dedup'd by this key (recommended for sends). */
  idempotencyKey?: string;
}

const IDEMPOTENT_METHODS = new Set<HttpMethod>(['GET']);

interface EvolutionApiError extends Error {
  details?: unknown;
  apiStatus?: number;
  retries?: number;
  retryAfterMs?: number;
}

/**
 * FIX (2026-07-05 — Bug #9): Explicit 401/403 guard added.
 * Credential errors must surface immediately so circuit-breaker logic
 * in useEvolutionAutoReconnect can halt polling permanently.
 */
function isRetriableStatus(status?: number): boolean {
  if (status == null) return true; // network / unknown -> retry
  // Credential errors: never retry — surface immediately to callers
  if (status === 401 || status === 403) return false;
  // Timeout / Too Early / Rate-limit
  if (status === 408 || status === 425 || status === 429) return true;
  // Transient server errors (includes 503 from Edge Function runtime)
  if (status >= 500 && status < 600) return true;
  // All other 4xx client errors (400, 404, 422…) — not retriable
  return false;
}

function parseRetryAfter(raw: unknown): number | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n * 1000);
  const date = Date.parse(String(raw));
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function useEvolutionApiCore() {
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useMountedRef();
  const inflightRef = useRef<Map<string, Promise<unknown>>>(new Map());

  useEffect(() => {
    // Esquenta cache de config global (não bloqueia)
    void loadRetryConfig();
  }, []);

  const callApi = useCallback(
    async <T = unknown>(action: string, body?: object, methodOrOptions: HttpMethod | CallApiOptions = 'POST'): Promise<T> => {
      const opts: CallApiOptions = typeof methodOrOptions === 'string'
        ? { method: methodOrOptions }
        : methodOrOptions;
      const method: HttpMethod = opts.method ?? 'POST';
      const dynCfg = getRetryConfigSync();
      const baseBackoffMs = opts.baseBackoffMs ?? dynCfg.baseBackoffMs;
      
      // Critical fix: force a much larger timeout (45s) for the bridge connection
      const timeoutMs = 45000; 


      // Validate + sanitize user-provided key; only a valid user key enables POST retry semantics.
      const userKey = normalizeIdempotencyKey(opts.idempotencyKey);
      if (opts.idempotencyKey && userKey !== opts.idempotencyKey) {
        log.debug('Idempotency key sanitized', {
          originalLength: opts.idempotencyKey.length,
          sanitizedPrefix: userKey?.slice(0, 16),
        });
      }
      // Stable derived key (POST only, no user key) — used for in-flight dedupe ONLY (not retries, not header).
      const derivedKey = !userKey && method === 'POST'
        ? await deriveIdempotencyKey(action, body)
        : undefined;
      const effectiveKey = userKey ?? derivedKey;

      const canRetry = IDEMPOTENT_METHODS.has(method) || !!userKey;
      const retries = Math.max(1, opts.retries ?? (canRetry ? dynCfg.maxRetries : 1));

      // Dedupe identical in-flight requests for idempotent verbs OR any POST with an effective key.
      const dedupeKey = effectiveKey
        ? `${method}:${action}:${effectiveKey}`
        : (IDEMPOTENT_METHODS.has(method) ? `${method}:${action}` : '');
      if (dedupeKey) {
        const existing = inflightRef.current.get(dedupeKey);
        if (existing) return existing as Promise<T>;
      }

      if (mountedRef.current) setIsLoading(true);

      const run = (async (): Promise<T> => {
        let attempt = 0;
        let lastError: EvolutionApiError | null = null;

        while (attempt < retries) {
          attempt++;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const invokeOpts: { method: 'POST'; body: object; headers?: Record<string, string>; signal?: AbortSignal } = {
              method: 'POST',
              body: body ?? {},
              signal: controller.signal,
            };
            if (userKey) {
              invokeOpts.headers = { 'Idempotency-Key': userKey };
            }
            
            // Fixed: Standardizing to Edge Function (Bridge) mode for stability. 
            // Local storage direct mode is prone to CORS and key drift.
            const { data, error } = await supabase.functions.invoke(`evolution-api/${action}`, invokeOpts);
            if (error) {
              const err = Object.assign(new Error(error.message || 'Evolution API error'), {
                apiStatus: (error as { status?: number }).status,
              }) as EvolutionApiError;
              throw err;
            }
            if (data && typeof data === 'object' && (data as { error?: boolean }).error === true) {
              const d = data as { message?: string; details?: unknown; status?: number; retryAfter?: unknown };
              const apiError = Object.assign(new Error(d.message || 'Evolution API error'), {
                details: d.details,
                apiStatus: d.status,
                retries: attempt,
                retryAfterMs: parseRetryAfter(d.retryAfter),
              }) as EvolutionApiError;
              throw apiError;
            }
            return data as T; // ignore-audit: supabase.functions.invoke returns unknown; T is constrained by callers
          } catch (error) {
            const err = error as EvolutionApiError;
            lastError = err;
            const status = err.apiStatus;
            if (attempt >= retries || !isRetriableStatus(status)) break;

            const backoff = err.retryAfterMs ?? baseBackoffMs * 2 ** (attempt - 1);
            const jitter = Math.floor(Math.random() * 100);
            try { await sleep(backoff + jitter); } catch { break; }
            continue;
          } finally {
            clearTimeout(timeoutId);
          }
        }

        log.error(`Evolution API error (${action}) after ${attempt} attempt(s):`, lastError);
        throw lastError ?? new Error(`Evolution API failed: ${action}`);
      })();

      const wrapped = run.finally(() => {
        if (dedupeKey) inflightRef.current.delete(dedupeKey);
        if (mountedRef.current) setIsLoading(false);
      });

      if (dedupeKey) inflightRef.current.set(dedupeKey, wrapped);
      return wrapped;
    },
    [],
  );

  const withToast = useCallback(
    async <T = unknown>(
      action: string,
      body: object | undefined,
      successMsg: string,
      errorMsg: string,
      methodOrOptions: HttpMethod | CallApiOptions = 'POST',
    ): Promise<T> => {
      try {
        const data = await callApi<T>(action, body, methodOrOptions);
        toast.success(successMsg);
        return data;
      } catch (error) {
        const msg = error instanceof Error ? error.message : errorMsg;
        toast.error(msg);
        throw error;
      }
    },
    [callApi],
  );

  return { isLoading, callApi, withToast };
}