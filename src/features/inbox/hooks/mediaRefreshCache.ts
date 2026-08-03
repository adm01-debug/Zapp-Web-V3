/**
 * mediaRefreshCache — cache em memória LRU para data URLs de mídia refrescada.
 *
 * F4-20: o `refreshCache` antigo era um `Map` sem cap — cada refresh de mídia
 * expirada guardava uma data URL base64 (dezenas de KB a MBs) para sempre,
 * podendo acumular 100s de MB ao longo de uma sessão longa com muitas
 * conversas.
 *
 * Implementação:
 *  - **LRU real**: acesso (get) promove a chave para MRU; eviction remove a
 *    menos recentemente usada (a mais antiga na ordem de inserção do Map).
 *  - **maxSize por bytes**: data URLs são ASCII, então `value.length` é um
 *    proxy exato de bytes. Padrão 50 MB (mesmo número do plano de auditoria).
 *  - **Cap de entradas**: teto de 200 chaves (defesa extra contra valores
 *    minúsculos que nunca estourariam o budget de bytes mas inflariam o
 *    número de entradas).
 *  - Overwrite de chave existente re-insere como MRU sem duplicar contagem.
 *
 * Módulo puro (sem React/supabase) para permitir teste unitário direto.
 */

/** Teto de bytes do cache (≈50 MB de data URLs). */
const DEFAULT_MAX_CACHE_BYTES = 50 * 1024 * 1024;

/** Teto de entradas (defesa extra — mesmo cap do plano original). */
const DEFAULT_MAX_CACHE_ENTRIES = 200;

/** Ordem de inserção = ordem de recência (LRU no início, MRU no fim). */
const cache = new Map<string, string>();
let cacheBytes = 0;
let maxCacheBytes = DEFAULT_MAX_CACHE_BYTES;
let maxCacheEntries = DEFAULT_MAX_CACHE_ENTRIES;

/**
 * Test-only override dos limites (bytes/entradas). `mediaCacheClear()` restaura
 * os valores padrão. Nada em produção chama isto.
 */
export function mediaCacheConfigure(opts: { maxBytes?: number; maxEntries?: number }): void {
  if (opts.maxBytes !== undefined) maxCacheBytes = opts.maxBytes;
  if (opts.maxEntries !== undefined) maxCacheEntries = opts.maxEntries;
}

/** Lê uma chave e promove para MRU. Retorna `undefined` quando ausente. */
export function mediaCacheGet(key: string): string | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  // Promoção para MRU: re-insere no fim da ordem de recência.
  cache.delete(key);
  cache.set(key, value);
  return value;
}

/** Insere/atualiza uma chave como MRU, evictando LRU até caber no budget. */
export function mediaCacheSet(key: string, value: string): void {
  const existing = cache.get(key);
  if (existing !== undefined) {
    cacheBytes -= existing.length;
    cache.delete(key);
  }
  cache.set(key, value);
  cacheBytes += value.length;

  // Evicta a entrada menos recentemente usada enquanto estiver acima do
  // budget de bytes OU do teto de entradas.
  while (cache.size > maxCacheEntries || cacheBytes > maxCacheBytes) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    const oldestValue = cache.get(oldestKey);
    if (oldestValue !== undefined) cacheBytes -= oldestValue.length;
    cache.delete(oldestKey);
  }
}

/** Métricas para diagnóstico (não usadas em hot path). */
export function mediaCacheStats(): { entries: number; bytes: number } {
  return { entries: cache.size, bytes: cacheBytes };
}

/** Limpa o cache e restaura os limites padrão (usado em testes). */
export function mediaCacheClear(): void {
  cache.clear();
  cacheBytes = 0;
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES;
  maxCacheEntries = DEFAULT_MAX_CACHE_ENTRIES;
}
