import { getLogger, generateCorrelationId } from '@/lib/logger';

const log = getLogger('RetryUtil');

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * True when the error is an intentional abort (AbortController.abort(),
 * page unload / navigation).
 *
 * Matches by `err.name` — NEVER by `message.includes(...)`: the real browser
 * message behind an AbortError during page unload is "Page unload", and
 * matching on message text is fragile across environments.
 */
export function isIntentionalAbort(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true;
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Resilient retry wrapper with exponential backoff and jitter.
 * Works with any async operation (Supabase, fetch, etc).
 *
 * @example
 * const data = await withRetry(() => dbFrom('contacts').select('*'), {
 *   maxRetries: 3,
 *   onRetry: (err, attempt) => console.log(`Retry ${attempt}`, err),
 * });
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    // SAFE DEFAULT: do NOT retry without an explicit policy.
    // `() => true` would retry EVERYTHING, including AbortError (page
    // unload / navigation), producing cascading "[RetryUtil] All N retries
    // exhausted AbortError: Page unload" errors. Callers MUST pass an
    // explicit `shouldRetry` that excludes AbortError.
    shouldRetry = () => false,
    onRetry,
  } = options;

  const correlationId = generateCorrelationId('retry');
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Intentional abort (page unload / navigation): never retry, never
      // log as ERROR. The browser aborts all in-flight fetches on unload;
      // "Page unload" is the real message behind those AbortErrors, so this
      // guard matches by err.name only and takes precedence over shouldRetry.
      if (isIntentionalAbort(error)) {
        log.debug(
          `[${correlationId}] Request aborted (attempt ${attempt + 1}) — not retrying`,
          error
        );
        throw error;
      }

      // Real error, but the retry policy says it is not retryable.
      if (!shouldRetry(error, attempt)) {
        log.warn(
          `[${correlationId}] Not retryable — aborting after ${attempt + 1} attempt(s)`,
          error
        );
        throw error;
      }

      // Retries genuinely exhausted after a retryable error.
      if (attempt >= maxRetries) {
        log.error(
          `[${correlationId}] All ${maxRetries} retries exhausted`,
          error
        );
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 500,
        maxDelayMs
      );

      log.warn(
        `[${correlationId}] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`
      );

      onRetry?.(error, attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Convenience: retry only on network-like errors (not 4xx client errors).
 */
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  return withRetry(operation, {
    maxRetries,
    shouldRetry: (error) => {
      // NEVER retry aborted requests (page unload, navigation). The browser
      // aborts all in-flight fetches on unload; retrying them is pointless
      // and only produces cascading "[RetryUtil] All N retries exhausted"
      // errors in the console.
      if (error instanceof Error && error.name === 'AbortError') return false;
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        const status = (error as unknown as { status?: number }).status;
        if (typeof status === 'number' && status >= 500) return true;
        // Word-boundary regex prevents '502' matching inside '5024' or URLs
        return (
          msg.includes('fetch') ||
          msg.includes('network') ||
          msg.includes('timeout') ||
          /\b(502|503|504)\b/.test(msg)
        );
      }
      return false;
    },
  });
}
