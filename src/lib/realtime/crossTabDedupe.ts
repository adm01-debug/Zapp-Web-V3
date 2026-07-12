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

import { getLogger } from '@/lib/logger';
import { recordDedupeEvent } from '@/lib/realtime/dedupeTelemetry';

const log = getLogger('crossTabDedupe');

const LS_LOCK_PREFIX = 'ctd:lock:';
const LS_RESULT_PREFIX = 'ctd:result:';
const LS_BUS_PREFIX = 'ctd:bus:'; // fallback de "broadcast" via storage event
const BC_NAME = 'cross-tab-dedupe';
const DEFAULT_LOCK_TTL = 10_000; // 10s — máximo razoável para pageload de 100 msgs
const DEFAULT_RESULT_TTL = 30_000; // resultado fica em cache 30s
const DEFAULT_WAIT_TIMEOUT = 8_000;
const GC_INTERVAL = 60_000; // varre chaves expiradas a cada 60s
const BUS_MSG_TTL = 15_000; // mensagens de bus expiram rápido (storage GC)

/** @internal — exposto para testes que precisam do prefixo de lock. */
export const LS_PREFIX = LS_LOCK_PREFIX;

interface LockPayload {
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
}

interface BroadcastMessage<T = unknown> {
  type: 'result' | 'error' | 'release';
  key: string;
  ownerId: string;
  data?: T;
  error?: string;
  ts: number;
  /** TTL do resultado (ms) — para que abas receptoras respeitem o mesmo prazo. */
  resultTtl?: number;
}

const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// In-memory: resultado recente + promises pendentes na mesma aba.
const resultCache = new Map<string, { value: unknown; expiresAt: number }>();
const inflight = new Map<string, Promise<unknown>>();
const waiters = new Map<string, Array<(v: { ok: true; data: unknown } | { ok: false; error: string }) => void>>();

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
    } catch (err) {
      log.error('Subscriber handler threw', { key, err });
    }
  });
}

// ─── Camada de transporte cross-tab ──────────────────────────────────────────
// Tenta BroadcastChannel; se indisponível (Safari antigo, alguns sandboxes,
// iframes restritos) ou se construtor lançar, faz fallback transparente
// usando o evento `storage` do localStorage.
//
// Compatibilidade: o consumidor chama `ensureTransport()` para garantir que o
// listener de entrada está ativo, e `sendBus(msg)` para emitir. O resto do
// arquivo permanece igual — `broadcast()` e `getBroadcastChannel()` viraram
// wrappers finos sobre essa camada para preservar a API interna.
type Transport = 'broadcast-channel' | 'storage-event' | 'none';
let transportKind: Transport | null = null;
let bc: BroadcastChannel | null = null;
let storageListenerInstalled = false;

function installStorageListener(): boolean {
  if (storageListenerInstalled) return true;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return false;
  try {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(LS_BUS_PREFIX)) return;
      if (!e.newValue) return; // remoção é nossa própria limpeza
      try {
        const msg = JSON.parse(e.newValue) as BroadcastMessage;
        // Filtro de TTL — evita reprocessar mensagens órfãs antigas.
        if (typeof msg.ts === 'number' && Date.now() - msg.ts > BUS_MSG_TTL) return;
        onBroadcast(msg);
      } catch {
        /* payload corrompido — ignora */
      }
    });
    storageListenerInstalled = true;
    return true;
  } catch {
    return false;
  }
}

function ensureTransport(): Transport {
  if (transportKind && transportKind !== 'none') return transportKind;
  // Tentativa 1 — BroadcastChannel.
  if (typeof BroadcastChannel !== 'undefined' && !bc) {
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.addEventListener('message', (e) => onBroadcast(e.data as BroadcastMessage)); // ignore-audit: narrows Supabase query result to local interface
      transportKind = 'broadcast-channel';
      log.debug('Transport ativo: BroadcastChannel');
      return transportKind;
    } catch {
      bc = null;
      // cai para fallback
    }
  }
  if (bc) {
    transportKind = 'broadcast-channel';
    return transportKind;
  }
  // Tentativa 2 — fallback via storage event.
  if (installStorageListener()) {
    transportKind = 'storage-event';
    log.debug('Transport ativo: storage event (fallback, BroadcastChannel indisponível)');
    return transportKind;
  }
  transportKind = 'none';
  return transportKind;
}

/** @deprecated Mantido para compatibilidade interna; prefira `ensureTransport`. */
function getBroadcastChannel(): BroadcastChannel | null {
  ensureTransport();
  return bc;
}

/** @internal — usado por testes para inspecionar o transporte ativo. */
export function __getActiveTransport(): Transport {
  return transportKind ?? 'none';
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
    // Notifica UI subscribers para que atualizem sem refazer fetch.
    notifySubscribers(msg.key, msg.data, 'remote');
  } else if (msg.type === 'error') {
    const ws = waiters.get(msg.key);
    if (ws) {
      ws.forEach((w) => w({ ok: false, error: msg.error || 'remote error' }));
      waiters.delete(msg.key);
    }
  } else if (msg.type === 'release') {
    // Lock liberado sem resultado — quem espera pode tentar adquirir.
    const ws = waiters.get(msg.key);
    if (ws) {
      ws.forEach((w) => w({ ok: false, error: 'released' }));
      waiters.delete(msg.key);
    }
  }
}

function readLock(key: string): LockPayload | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_LOCK_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LockPayload;
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(LS_LOCK_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLock(key: string, ttl: number): boolean {
  if (typeof localStorage === 'undefined') return false;
  const existing = readLock(key);
  if (existing && existing.ownerId !== TAB_ID) return false;
  try {
    const payload: LockPayload = {
      ownerId: TAB_ID,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    localStorage.setItem(LS_LOCK_PREFIX + key, JSON.stringify(payload));
    const verify = readLock(key);
    return verify?.ownerId === TAB_ID;
  } catch {
    return false;
  }
}

function releaseLock(key: string) {
  if (typeof localStorage === 'undefined') return;
  const lock = readLock(key);
  if (lock && lock.ownerId !== TAB_ID) return;
  try {
    localStorage.removeItem(LS_LOCK_PREFIX + key);
  } catch {
    /* noop */
  }
}

// ─── Result cache persistente em localStorage (compartilhado entre abas) ──────
interface ResultPayload<T = unknown> {
  value: T;
  expiresAt: number;
}

function readPersistedResult<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_RESULT_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResultPayload<T>;
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(LS_RESULT_PREFIX + key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

function writePersistedResult<T>(key: string, value: T, ttl: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: ResultPayload<T> = { value, expiresAt: Date.now() + ttl };
    localStorage.setItem(LS_RESULT_PREFIX + key, JSON.stringify(payload));
  } catch {
    /* quota cheia ou serialização falhou — degrada silenciosamente */
  }
}

// ─── Garbage collector: varre chaves expiradas periodicamente ─────────────────
export function gcExpiredKeys(): { locksSwept: number; resultsSwept: number } {
  let locksSwept = 0;
  let resultsSwept = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      const now = Date.now();
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          !k.startsWith(LS_LOCK_PREFIX) &&
          !k.startsWith(LS_RESULT_PREFIX) &&
          !k.startsWith(LS_BUS_PREFIX)
        ) continue;
        try {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          // Para bus: limpa qualquer slot mais velho que BUS_MSG_TTL
          if (k.startsWith(LS_BUS_PREFIX)) {
            try {
              const parsed = JSON.parse(raw) as { ts?: number };
              if (typeof parsed.ts === 'number' && now - parsed.ts > BUS_MSG_TTL) {
                toRemove.push(k);
              }
            } catch { toRemove.push(k); }
            continue;
          }
          const parsed = JSON.parse(raw) as { expiresAt?: number };
          if (typeof parsed.expiresAt === 'number' && parsed.expiresAt < now) {
            toRemove.push(k);
          }
        } catch {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        localStorage.removeItem(k);
        if (k.startsWith(LS_LOCK_PREFIX)) locksSwept++;
        else resultsSwept++;
      }
    } catch {
      /* noop */
    }
  }
  for (const [k, entry] of resultCache) {
    if (entry.expiresAt < Date.now()) resultCache.delete(k);
  }
  return { locksSwept, resultsSwept };
}

let gcTimer: ReturnType<typeof setInterval> | null = null;
function startGcIfNeeded() {
  if (gcTimer || typeof setInterval === 'undefined') return;
  gcTimer = setInterval(gcExpiredKeys, GC_INTERVAL);
  if (gcTimer && typeof (gcTimer as { unref?: () => void }).unref === 'function') {
    (gcTimer as { unref?: () => void }).unref?.();
  }
}

function broadcast<T>(msg: BroadcastMessage<T>) {
  const kind = ensureTransport();
  if (kind === 'broadcast-channel' && bc) {
    try { bc.postMessage(msg); return; } catch { /* cai no fallback */ }
  }
  if (kind === 'storage-event' || kind === 'broadcast-channel') {
    // Fallback: escreve em um slot rotativo do localStorage. O `storage`
    // event é disparado em TODAS as outras abas que tenham o mesmo origin
    // — mantemos paridade funcional (result/error/release) com o BC.
    if (typeof localStorage === 'undefined') return;
    try {
      // Slot único por mensagem para garantir que `storage` event dispare
      // mesmo quando o mesmo `key` é reescrito em sequência (o evento
      // só dispara em mudança de valor; usar um slot único evita a colisão).
      const slot = `${LS_BUS_PREFIX}${TAB_ID}:${msg.ts}:${Math.random().toString(36).slice(2, 8)}`;
      const payload = JSON.stringify(msg);
      localStorage.setItem(slot, payload);
      // Remove logo em seguida — não precisamos persistir, só sinalizar.
      // Pequeno delay para que abas espectadoras tenham chance de ler em
      // navegadores que entregam o evento de forma assíncrona.
      setTimeout(() => {
        try { localStorage.removeItem(slot); } catch { /* noop */ }
      }, 250);
    } catch {
      /* quota cheia ou serialização falhou — degrada silenciosamente */
    }
  }
}

export interface DedupeOptions {
  /** TTL do lock no localStorage (ms). Default 10s. */
  lockTtl?: number;
  /** TTL do resultado em cache (ms). Default 30s. */
  resultTtl?: number;
  /** Quanto esperar pelo broadcast antes de fazer fetch direto (ms). Default 8s. */
  waitTimeout?: number;
}

export async function dedupedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: DedupeOptions = {},
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
    resultCache.delete(key); // expirado: força reprocessamento
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
    return pending as Promise<T>;
  }

  // 3. Tenta adquirir lock cross-tab.
  const acquired = writeLock(key, lockTtl);
  if (!acquired) {
    // Garante que o BroadcastChannel está ativo ANTES de aguardar — caso
    // contrário a aba espectadora nunca registra o listener e perde o
    // broadcast do líder, caindo desnecessariamente no fallback de cache.
    getBroadcastChannel();
    log.debug('Lock detido por outra aba, aguardando broadcast', { key });
    const waited = await waitForResult<T>(key, waitTimeout);
    if (waited.ok) {
      recordDedupeEvent({
        key,
        reason: 'broadcast_wait',
        durationMs: Date.now() - startedAt,
      });
      return waited.data;
    }
    // Antes de cair em fallback, reconfere o cache persistente — a líder
    // pode ter terminado depois do broadcast já ter passado.
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
    // Líder falhou ou expirou: tenta executar localmente como fallback.
  }

  // 4. Líder: executa fetcher, cacheia (memória + localStorage), broadcasta, libera lock.
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
  timeoutMs: number,
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
        if (k && (k.startsWith(LS_LOCK_PREFIX) || k.startsWith(LS_RESULT_PREFIX) || k.startsWith(LS_BUS_PREFIX))) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* noop */
    }
  }
}

export const __TAB_ID = TAB_ID;

/**
 * Subscreve-se a resultados de dedupedFetch concluídos em qualquer aba.
 *
 * Útil para que abas espectadoras atualizem a UI quando outra aba completa
 * um fetch — sem precisar refazer a requisição. O handler é chamado tanto
 * quando o broadcast chega de outra aba (`source: 'remote'`) quanto quando
 * a própria aba conclui o fetch (`source: 'local'`).
 *
 * @param keyMatcher  string exata, prefixo (ex.: "inbox:initial:") ou RegExp.
 * @param handler     callback (key, data, source) => void
 * @returns           função de unsubscribe
 */
export function subscribeDedupe<T = unknown>(
  keyMatcher: string | RegExp,
  handler: SubscriberFn<T>,
): () => void {
  const match = typeof keyMatcher === 'string'
    ? (k: string) => k === keyMatcher || k.startsWith(keyMatcher)
    : (k: string) => keyMatcher.test(k);
  const sub: Subscription = { match, handler: handler as SubscriberFn };
  subscribers.add(sub);
  // Garante que o BroadcastChannel está ativo para entregar mensagens.
  getBroadcastChannel();
  return () => {
    subscribers.delete(sub);
  };
}

/** @internal — para testes. */
export function __notifyLocal(key: string, data: unknown) {
  notifySubscribers(key, data, 'local');
}

