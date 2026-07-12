/**
 * dedupeTelemetry — Contadores de acertos e misses do crossTabDedupe.
 *
 * Para cada chamada ao `dedupedFetch`, o módulo `crossTabDedupe` emite um
 * evento descrevendo se a requisição foi servida do cache (HIT) ou
 * efetivamente executou o fetcher (MISS), classificado pelo motivo:
 *
 *   HIT:
 *     - memory_cache       — resultado em memória ainda dentro do TTL
 *     - persisted_cache    — resultado em localStorage (outra aba já fez)
 *     - inflight_local     — Promise em andamento na mesma aba
 *     - broadcast_wait     — recebeu via BroadcastChannel enquanto esperava
 *     - late_cache         — cache persistido apareceu após waitTimeout
 *
 *   MISS:
 *     - lock_acquired_lead — esta aba pegou o lock e rodou o fetcher
 *     - fallback_after_wait — líder falhou/expirou; rodou o fetcher local
 *
 * `keyKind` distingue:
 *     - idempotency — chaves determinísticas (ex.: `inbox:initial:<jid>:100`)
 *     - hash        — chaves baseadas em hash do payload
 *     - unknown     — não foi possível classificar
 *
 * O snapshot é exposto em `window.__dedupeTelemetry` para DevTools.
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('dedupeTelemetry');

export type DedupeOutcome = 'hit' | 'miss';

export type DedupeHitReason =
  | 'memory_cache'
  | 'persisted_cache'
  | 'inflight_local'
  | 'broadcast_wait'
  | 'late_cache';

export type DedupeMissReason =
  | 'lock_acquired_lead'
  | 'fallback_after_wait';

export type DedupeReason = DedupeHitReason | DedupeMissReason;

export type DedupeKeyKind = 'idempotency' | 'hash' | 'unknown';

export interface DedupeEvent {
  key: string;
  outcome: DedupeOutcome;
  reason: DedupeReason;
  keyKind: DedupeKeyKind;
  /** Namespace lógico (prefixo antes do primeiro `:`). Ex.: `inbox`, `older`. */
  namespace: string;
  /** Tempo de espera/execução em ms (apenas para misses e broadcast_wait). */
  durationMs?: number;
  /** Erro propagado (apenas para misses que falharam). */
  errorMessage?: string;
  ts: number;
}

export interface DedupeTelemetrySnapshot {
  total: number;
  hits: number;
  misses: number;
  hitRate: number;
  byReason: Record<DedupeReason, number>;
  byKeyKind: Record<DedupeKeyKind, number>;
  byNamespace: Record<string, { hits: number; misses: number }>;
  recentEvents: DedupeEvent[];
}

const RECENT_LIMIT = 100;

const initialByReason = (): Record<DedupeReason, number> => ({
  memory_cache: 0,
  persisted_cache: 0,
  inflight_local: 0,
  broadcast_wait: 0,
  late_cache: 0,
  lock_acquired_lead: 0,
  fallback_after_wait: 0,
});

const initialByKeyKind = (): Record<DedupeKeyKind, number> => ({
  idempotency: 0,
  hash: 0,
  unknown: 0,
});

interface State {
  total: number;
  hits: number;
  misses: number;
  byReason: Record<DedupeReason, number>;
  byKeyKind: Record<DedupeKeyKind, number>;
  byNamespace: Record<string, { hits: number; misses: number }>;
  recentEvents: DedupeEvent[];
}

const state: State = {
  total: 0,
  hits: 0,
  misses: 0,
  byReason: initialByReason(),
  byKeyKind: initialByKeyKind(),
  byNamespace: {},
  recentEvents: [],
};

const HIT_REASONS = new Set<DedupeReason>([
  'memory_cache',
  'persisted_cache',
  'inflight_local',
  'broadcast_wait',
  'late_cache',
]);

/** Namespaces conhecidos do projeto que usam chaves determinísticas. */
const KNOWN_IDEMPOTENCY_NAMESPACES = new Set([
  'inbox',
  'older',
  'sub',     // dedupe por subscriber (testes)
  'multi',   // testes multi-aba
  'persist', // testes de cache persistente
  'remote',
]);

/** Heurística simples: chaves do projeto seguem o padrão `<ns>:<segmentos>`. */
export function inferKeyKind(key: string): DedupeKeyKind {
  if (!key || typeof key !== 'string') return 'unknown';
  const ns = extractNamespace(key);
  if (KNOWN_IDEMPOTENCY_NAMESPACES.has(ns)) return 'idempotency';
  // Heurística para hashes: 32+ hex chars contínuos no início.
  if (/^[a-f0-9]{32,}/i.test(key)) return 'hash';
  // Tem `:` separando segmentos legíveis → trata como idempotency key
  // genérica (composta determinisicamente pelo chamador).
  if (key.includes(':')) return 'idempotency';
  return 'unknown';
}

export function extractNamespace(key: string): string {
  const idx = key.indexOf(':');
  return idx === -1 ? key : key.slice(0, idx);
}

export function recordDedupeEvent(
  partial: Omit<DedupeEvent, 'outcome' | 'keyKind' | 'namespace' | 'ts'> & {
    keyKind?: DedupeKeyKind;
    namespace?: string;
  },
): void {
  const namespace = partial.namespace ?? extractNamespace(partial.key);
  const keyKind = partial.keyKind ?? inferKeyKind(partial.key);
  const outcome: DedupeOutcome = HIT_REASONS.has(partial.reason) ? 'hit' : 'miss';

  const evt: DedupeEvent = {
    key: partial.key,
    outcome,
    reason: partial.reason,
    keyKind,
    namespace,
    durationMs: partial.durationMs,
    errorMessage: partial.errorMessage,
    ts: Date.now(),
  };

  state.total += 1;
  if (outcome === 'hit') state.hits += 1;
  else state.misses += 1;
  state.byReason[evt.reason] += 1;
  state.byKeyKind[evt.keyKind] += 1;
  const ns = (state.byNamespace[namespace] ??= { hits: 0, misses: 0 });
  if (outcome === 'hit') ns.hits += 1;
  else ns.misses += 1;

  state.recentEvents.push(evt);
  if (state.recentEvents.length > RECENT_LIMIT) {
    state.recentEvents.splice(0, state.recentEvents.length - RECENT_LIMIT);
  }

  if (typeof window !== 'undefined') {
    try {
      (window as unknown as { __dedupeTelemetry?: DedupeTelemetrySnapshot }).__dedupeTelemetry = // ignore-audit — window debug property for devtools inspection
        getDedupeTelemetrySnapshot();
    } catch {
      /* noop */
    }
  }

  log.debug('dedupe event', { key: evt.key, outcome, reason: evt.reason, keyKind: evt.keyKind });
}

export function getDedupeTelemetrySnapshot(): DedupeTelemetrySnapshot {
  return {
    total: state.total,
    hits: state.hits,
    misses: state.misses,
    hitRate: state.total === 0 ? 0 : state.hits / state.total,
    byReason: { ...state.byReason },
    byKeyKind: { ...state.byKeyKind },
    byNamespace: Object.fromEntries(
      Object.entries(state.byNamespace).map(([k, v]) => [k, { ...v }]),
    ),
    recentEvents: state.recentEvents.slice(-RECENT_LIMIT),
  };
}

/** Reseta o singleton (uso em testes). */
export function resetDedupeTelemetry(): void {
  state.total = 0;
  state.hits = 0;
  state.misses = 0;
  state.byReason = initialByReason();
  state.byKeyKind = initialByKeyKind();
  state.byNamespace = {};
  state.recentEvents = [];
  if (typeof window !== 'undefined') {
    try {
      (window as unknown as { __dedupeTelemetry?: DedupeTelemetrySnapshot }).__dedupeTelemetry = // ignore-audit — window debug property for devtools inspection
        getDedupeTelemetrySnapshot();
    } catch {
      /* noop */
    }
  }
}
