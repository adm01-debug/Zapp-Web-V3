/**
 * crossTabDedupe — Evita chamadas duplicadas de carregamento entre abas.
 *
 * Estratégia híbrida:
 *   1. localStorage como "lock" (com TTL curto). Se uma aba já está carregando
 *      uma chave (ex: `older:<jid>:<cursor>`), as outras esperam.
 *   2. BroadcastChannel para propagar o RESULTADO assim que pronto, evitando
 *      que cada aba refaça a chamada quando o lock expira.
 *
 * API:
 *   - dedupedFetch(key, fetcher, opts?) → Promise<T>
 *
 * Garantias:
 *   - Mesma aba: requisições concorrentes para a mesma key compartilham a Promise.
 *   - Abas diferentes: a primeira que pega o lock executa; as demais aguardam o
 *     broadcast (até timeout) e caem em fetch direto se a líder falhar.
 *   - Resultado é cacheado em memória por TTL curto (default 30s) para reentrada.
 */

import { recordDedupeEvent } from '@/lib/realtime/dedupeTelemetry';
import {
  DEFAULT_LOCK_TTL,
  DEFAULT_RESULT_TTL,
  DEFAULT_WAIT_TIMEOUT,
  GC_INTERVAL,
  TAB_ID,
  LS_LOCK_PREFIX,
  LS_RESULT_PREFIX,
  LS_BUS_PREFIX,
  type BroadcastMessage,
  type DedupeOptions,
} from './crossTabDedupeTypes';
import { readLock, writeLock, releaseLock } from './crossTabDedupeLock';
import {
  readPersistedResult,
  writePersistedResult,
  gcLocalStorageKeys,
} from './crossTabDedupeCache';
import { ensureTransport, broadcast, __getActiveTransport } from './crossTabDedupeTransport';

export { LS_PREFIX, type DedupeOptions, TAB_ID as __TAB_ID } from './crossTabDedupeTypes';
export { __getActiveTransport } from './crossTabDedupeTransport';

// In-memory: resultado recente + promises pendentes na mesma aba.
const resultCache = new Map<string, { value: unknown; expiresAt: number }>();
const inflight = new Map<string, Promise<unknown>>();
const waiters = new Map<
  string,
  Array<(v: { ok: true; data: unknown } | { ok: false; error: string }) => void>
>();

// Subscribers: handlers da UI interessados em receber resultados que chegam
// via BroadcastChannel (de outras abas). Chave é uma string ou regex.
type SubscriberFn<T = unknown> = (key: string, data: T, source: 'remote' | 'local') => void;
interface Subscription {
  match: (key: string) => boolean;
  handler: SubscriberFn;
}
const subscribers = new Set<Subscription>();

function notifySubscribers(key: string, data: unknown, source: 'remote' | 'local') {
  subscribers.forEach((sub) => {
    if (!sub.match(key)) return;
    try {
      sub.handler(key, data, source);
    } catch {
      /* swallow handler errors */
    }
  });
}

function onBroadcast(msg: BroadcastMessage) {
  if (!msg || msg.ownerId === TAB_ID) return; // ignora eco da própria aba
  if (msg.type === 'result') {
    const ttl = msg.resultTtl ?? DEFAULT_RESULT_TTL;
    resultCache.set(msg.key, { value: msg.data, expiresAt: Date.now() + ttl });
    writePersistedResult(msg.key, msg.data, ttl);
    const ws = waiters.get(msg.key);
    if (ws) {
      ws.forEach((w) => w({ ok: true, data: msg.data }));
      waiters.delete(msg.key);
    }
    notifySubscribers(msg.key, msg.data, 'remote');
  } else if (msg.type === 'error') {
    const ws = waiters.get(msg.key);
    if (ws) {
      ws.forEach((w) => w({ ok: false, error: msg.error || 'remote error' }));
      waiters.delete(msg.key);
    }
  } else if (msg.type === 'release') {
    const ws = waiters.get(msg.key);
    if (ws) {
      ws.forEach((w) => w({ ok: false, error: 'released' }));
      waiters.delete(msg.key);
    }
  }
}

// ─── GC: varre chaves expiradas periodicamente ───────────────────────────────
export function gcExpiredKeys(): { locksSwept: number; resultsSwept: number } {
  const stats = gcLocalStorageKeys();
  for (const [k, entry] of resultCache) {
    if (entry.expiresAt < Date.now()) resultCache.delete(k);
  }
  return stats;
}

let gcTimer: ReturnType<typeof setInterval> | null = null;
function startGcIfNeeded() {
  if (gcTimer || typeof setInterval === 'undefined') return;
  gcTimer = setInterval(gcExpiredKeys, GC_INTERVAL);
  if (gcTimer && typeof (gcTimer as { unref?: () => void }).unref === 'function') {
    (gcTimer as { unref?: () => void }).unref?.();
  }
}

// ─── Main API ─────────────────────────────────────────────────────────────────
export async function dedupedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: DedupeOptions = {}
): Promise<T> {
  const lockTtl = opts.lockTtl ?? DEFAULT_LOCK_TTL;
  const resultTtl = opts.resultTtl ?? DEFAULT_RESULT_TTL;
  const waitTimeout = opts.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;

  startGcIfNeeded();
  const startedAt = Date.now();

  // 1. Cache em memória.
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    recordDedupeEvent({ key, reason: 'memory_cache' });
    return cached.value as T;
  }
  if (cached && cached.expiresAt <= Date.now()) {
    resultCache.delete(key);
  }

  // 1b. Cache persistente em localStorage (compartilhado entre abas).
  const persisted = readPersistedResult<T>(key);
  if (persisted !== null) {
    resultCache.set(key, { value: persisted, expiresAt: Date.now() + resultTtl });
    recordDedupeEvent({ key, reason: 'persisted_cache' });
    return persisted;
  }

  // 2. Inflight na mesma aba.
  const pending = inflight.get(key);
  if (pending) {
    recordDedupeEvent({ key, reason: 'inflight_local' });
    return pending as Promise<T>; // ignore-audit: inflight map stores Promise<unknown>; cast safe — same key was inserted with Promise<T>
  }

  // 3. Tenta adquirir lock cross-tab.
  const acquired = writeLock(key, lockTtl);
  if (!acquired) {
    // Garante que o BroadcastChannel está ativo ANTES de aguardar — caso
    // contrário a aba espectadora nunca registra o listener e perde o
    // broadcast do líder, caindo desnecessariamente no fallback de cache.
    ensureTransport(onBroadcast);
    const waited = await waitForResult<T>(key, waitTimeout);
    if (waited.ok) {
      recordDedupeEvent({
        key,
        reason: 'broadcast_wait',
        durationMs: Date.now() - startedAt,
      });
      return waited.data;
    }
    // Antes de cair em fallback, reconfere o cache persistente.
    const lateCache = readPersistedResult<T>(key);
    if (lateCache !== null) {
      resultCache.set(key, { value: lateCache, expiresAt: Date.now() + resultTtl });
      recordDedupeEvent({
        key,
        reason: 'late_cache',
        durationMs: Date.now() - startedAt,
      });
      return lateCache;
    }
  }

  // 4. Líder: executa fetcher, cacheia, broadcasta, libera lock.
  const isFallback = !acquired;
  const exec = (async () => {
    try {
      const data = await fetcher();
      resultCache.set(key, { value: data, expiresAt: Date.now() + resultTtl });
      writePersistedResult(key, data, resultTtl);
      broadcast<T>({ type: 'result', key, ownerId: TAB_ID, data, ts: Date.now(), resultTtl });
      notifySubscribers(key, data, 'local');
      recordDedupeEvent({
        key,
        reason: isFallback ? 'fallback_after_wait' : 'lock_acquired_lead',
        durationMs: Date.now() - startedAt,
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      broadcast({ type: 'error', key, ownerId: TAB_ID, error: message, ts: Date.now() });
      recordDedupeEvent({
        key,
        reason: isFallback ? 'fallback_after_wait' : 'lock_acquired_lead',
        durationMs: Date.now() - startedAt,
        errorMessage: message,
      });
      throw err;
    } finally {
      releaseLock(key);
      broadcast({ type: 'release', key, ownerId: TAB_ID, ts: Date.now() });
      inflight.delete(key);
    }
  })();
  inflight.set(key, exec);
  return exec;
}

function waitForResult<T>(
  key: string,
  timeoutMs: number
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { ok: true; data: unknown } | { ok: false; error: string }) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      const list = waiters.get(key);
      if (list) {
        const idx = list.indexOf(finish);
        if (idx >= 0) list.splice(idx, 1);
      }
      resolve(r as { ok: true; data: T } | { ok: false; error: string });
    };
    const list = waiters.get(key) ?? [];
    list.push(finish);
    waiters.set(key, list);
    const t = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
  });
}

/** Limpa cache, locks e waiters (uso em testes / logout). */
export function clearCrossTabDedupe(): void {
  resultCache.clear();
  inflight.clear();
  waiters.clear();
  subscribers.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.startsWith(LS_LOCK_PREFIX) ||
            k.startsWith(LS_RESULT_PREFIX) ||
            k.startsWith(LS_BUS_PREFIX))
        )
          keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* noop */
    }
  }
}

/**
 * Subscreve-se a resultados de dedupedFetch concluídos em qualquer aba.
 *
 * @param keyMatcher  string exata, prefixo (ex.: "inbox:initial:") ou RegExp.
 * @param handler     callback (key, data, source) => void
 * @returns           função de unsubscribe
 */
export function subscribeDedupe<T = unknown>(
  keyMatcher: string | RegExp,
  handler: SubscriberFn<T>
): () => void {
  const match =
    typeof keyMatcher === 'string'
      ? (k: string) => k === keyMatcher || k.startsWith(keyMatcher)
      : (k: string) => keyMatcher.test(k);
  const sub: Subscription = { match, handler: handler as SubscriberFn };
  subscribers.add(sub);
  ensureTransport(onBroadcast);
  return () => {
    subscribers.delete(sub);
  };
}

/** @internal — para testes. */
export function __notifyLocal(key: string, data: unknown) {
  notifySubscribers(key, data, 'local');
}
