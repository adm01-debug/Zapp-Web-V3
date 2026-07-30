/**
 * Request Deduplication & Coalescing
 *
 * Previne requests duplicadas em paralelo para a mesma chave.
 * Quando múltiplas chamadas idênticas são feitas simultaneamente,
 * apenas uma é executada e todas recebem o mesmo resultado.
 *
 * Uso:
 * ```typescript
 * const dedup = createRequestDeduplicator();
 *
 * const data = await dedup.execute(
 *   `contacts/${contactId}`,
 *   () => fetchContact(contactId),
 *   { ttl: 5000 } // Cache por 5s
 * );
 * ```
 */

interface CacheEntry<T> {
  promise: Promise<T>;
  timestamp: number;
  data?: T;
}

interface ExecuteOptions {
  /** TTL em ms para cachear o resultado */
  ttl?: number;
  /** Se true, retorna resultado cacheado mesmo após expirar (stale-while-revalidate) */
  swr?: boolean;
}

export function createRequestDeduplicator() {
  const cache = new Map<string, CacheEntry<unknown>>();
  const inflight = new Map<string, Promise<unknown>>();

  function isExpired(entry: CacheEntry<unknown>, ttl: number): boolean {
    return Date.now() - entry.timestamp > ttl;
  }

  async function execute<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: ExecuteOptions = {}
  ): Promise<T> {
    const ttl = options.ttl ?? 0;

    // 1. Verificar cache existente
    const cached = cache.get(key);
    if (cached) {
      if (!isExpired(cached, ttl)) {
        // Cache válido, retornar imediatamente
        return cached.data as T;
      }

      if (options.swr && cached.data !== undefined) {
        // Stale-while-revalidate: retorna cache antigo + atualiza em background
        void refreshInBackground(key, fetcher, ttl);
        return cached.data as T;
      }
    }

    // 2. Verificar se já existe request em flight
    const existing = inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    // 3. Criar nova request
    const promise = (async () => {
      try {
        const data = await fetcher();
        cache.set(key, {
          promise: Promise.resolve(data),
          timestamp: Date.now(),
          data,
        });
        return data;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  async function refreshInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ttl: number
  ): Promise<void> {
    if (inflight.has(key)) return;

    const promise = (async () => {
      try {
        const data = await fetcher();
        cache.set(key, {
          promise: Promise.resolve(data),
          timestamp: Date.now(),
          data,
        });
      } catch (e) {
        // Log error but don't throw - we're in background
        console.warn(`[RequestDeduplicator] Background refresh failed for ${key}:`, e);
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    await promise;
  }

  function invalidate(key: string): void {
    cache.delete(key);
    inflight.delete(key);
  }

  function invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
        inflight.delete(key);
        count++;
      }
    }
    return count;
  }

  function clear(): void {
    cache.clear();
    inflight.clear();
  }

  function getStats() {
    return {
      cacheSize: cache.size,
      inflightCount: inflight.size,
    };
  }

  return {
    execute,
    invalidate,
    invalidatePrefix,
    clear,
    getStats,
  };
}

/**
 * Singleton global para dedupe cross-component.
 * Útil para queries frequentes que múltiplos componentes podem disparar.
 */
let globalDeduplicator: ReturnType<typeof createRequestDeduplicator> | null = null;

export function getGlobalRequestDeduplicator() {
  if (!globalDeduplicator) {
    globalDeduplicator = createRequestDeduplicator();
  }
  return globalDeduplicator;
}
