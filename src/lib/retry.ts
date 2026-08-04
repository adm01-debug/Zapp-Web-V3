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

      if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
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
