/**
 * Query timeout centralizado para todas as queries Supabase.
 *
 * Aplica timeout consistente em todas as chamadas de banco,
 * prevenindo queries lentas de travar a aplicação.
 *
 * Cenários de uso:
 * - Analytics queries (podem demorar)
 * - Health checks (devem ser rápidos)
 * - User-facing queries (latência baixa)
 */

export type QueryTimeout = 'fast' | 'normal' | 'slow' | 'analytics';

const TIMEOUTS: Record<QueryTimeout, number> = {
  fast: 2_000, // 2s — health checks, realtime
  normal: 8_000, // 8s — UI queries
  slow: 30_000, // 30s — exports
  analytics: 120_000, // 2min — aggregations
};

/**
 * Wraps a Supabase query with a timeout via AbortController.
 * Returns the query result or throws on timeout.
 *
 * @example
 * ```typescript
 * const { data, error } = await withQueryTimeout(
 *   supabase.from('contacts').select('*'),
 *   'normal'
 * );
 * ```
 */
export async function withQueryTimeout<T>(
  queryPromise: PromiseLike<{ data: T | null; error: unknown }>,
  timeout: QueryTimeout = 'normal'
): Promise<{ data: T | null; error: unknown }> {
  const timeoutMs = TIMEOUTS[timeout];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Race between query and timeout
    const result = await Promise.race([
      Promise.resolve(queryPromise),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new QueryTimeoutError(timeoutMs));
        });
      }),
    ]);

    clearTimeout(timeoutId);
    return result as { data: T | null; error: unknown };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof QueryTimeoutError) {
      return {
        data: null,
        error: {
          message: `Query timeout after ${timeoutMs}ms`,
          code: 'QUERY_TIMEOUT',
          timeoutMs,
        },
      };
    }
    throw err;
  }
}

/**
 * Error thrown when a query exceeds its timeout.
 */
export class QueryTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Query exceeded timeout of ${timeoutMs}ms`);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Default timeout configuration by environment.
 */
export const DEFAULT_TIMEOUTS = {
  dev: 'normal' as QueryTimeout,
  staging: 'normal' as QueryTimeout,
  production: 'normal' as QueryTimeout,
};

/**
 * Helper: get recommended timeout for query type.
 */
export function recommendedTimeout(type: 'select' | 'insert' | 'update' | 'delete' | 'rpc'): QueryTimeout {
  switch (type) {
    case 'select':
      return 'normal';
    case 'insert':
    case 'update':
    case 'delete':
      return 'fast';
    case 'rpc':
      return 'slow';
    default:
      return 'normal';
  }
}
