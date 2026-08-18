/**
 * Telemetria de reconciliação otimista.
 *
 * Conta matches por estratégia (external_id, fallback de texto, fallback de mídia)
 * e por tipo de mensagem (text/audio/image/video/sticker/document/...).
 *
 * NOTA: Para áudio, a telemetria agora diferencia PTT vs Gravado lendo os
 * metadados da bolha otimista (media_meta.ptt).
 *
 * Uso:
 *   - `reconcileOptimistic` emite eventos via `recordMatch`.
 *   - Painéis admin/devtools leem via `getReconciliationStats()`.
 *   - Logs estruturados aparecem no console com prefixo `[reconcile]` quando
 *     `import.meta.env.DEV` ou `localStorage.debug_reconcile === '1'`.
 */

import { getLogger } from '@/lib/logger';
const log = getLogger('reconciliationTelemetry');

/** Which reconciliation strategy resolved a given optimistic→canonical match. */
export type MatchStrategy = 'external_id' | 'text_fallback' | 'media_fallback';

/** Single reconciliation event capturing which strategy matched an optimistic bubble to its canonical DB row. */
export interface MatchEvent {
  strategy: MatchStrategy;
  messageType: string;
  optimisticId: string;
  canonicalId: string;
  /** ms entre created_at otimista e canônico (apenas fallbacks). */
  deltaMs?: number;
  at: number;
}

/** Troca de fonte de mensagens do inbox (E36 dual-path): evo cursor-based → legado zapp.messages. */
export interface SourceSwitchEvent {
  from: 'evo' | 'zapp';
  to: 'evo' | 'zapp';
  reason: string;
  at: number;
}

interface Counters {
  total: number;
  byStrategy: Record<MatchStrategy, number>;
  byMessageType: Record<string, number>;
  /** matrix [strategy][messageType] -> count */
  byStrategyAndType: Record<MatchStrategy, Record<string, number>>;
  /** E36: nº de vezes que o inbox caiu do path evo para o legado (modo auto). */
  sourceFallback: number;
}

const counters: Counters = {
  total: 0,
  byStrategy: { external_id: 0, text_fallback: 0, media_fallback: 0 },
  byMessageType: {},
  byStrategyAndType: {
    external_id: {},
    text_fallback: {},
    media_fallback: {},
  },
  sourceFallback: 0,
};

const recentEvents: MatchEvent[] = [];
const MAX_RECENT = 100;
const sourceSwitchEvents: SourceSwitchEvent[] = [];
const MAX_SOURCE_SWITCH_EVENTS = 100;
const listeners = new Set<(ev: MatchEvent) => void>();

function debugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (import.meta.env?.DEV) return true;
    return window.localStorage?.getItem('debug_reconcile') === '1';
  } catch {
    return false;
  }
}

/** Records a reconciliation match, updates counters/ring buffer, and notifies subscribers. */
export function recordMatch(ev: Omit<MatchEvent, 'at'>): void {
  const event: MatchEvent = { ...ev, at: Date.now() };
  counters.total += 1;
  counters.byStrategy[event.strategy] += 1;
  counters.byMessageType[event.messageType] =
    (counters.byMessageType[event.messageType] ?? 0) + 1;
  const matrix = counters.byStrategyAndType[event.strategy];
  matrix[event.messageType] = (matrix[event.messageType] ?? 0) + 1;

  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT) recentEvents.shift();

  if (debugEnabled()) {
    log.debug('[reconcile]', {
      strategy: event.strategy,
      messageType: event.messageType,
      optimisticId: event.optimisticId,
      canonicalId: event.canonicalId,
      deltaMs: event.deltaMs,
      total: counters.total,
    });
  }

  for (const fn of listeners) {
    try { fn(event); } catch { /* listeners não devem quebrar reconciliação */ }
  }
}

/** Returns a shallow copy of the current reconciliation counters (total, by-strategy, by-type, matrix). */
export function getReconciliationStats(): Counters {
  // Devolve cópia rasa para evitar mutação externa dos contadores.
  return {
    total: counters.total,
    byStrategy: { ...counters.byStrategy },
    byMessageType: { ...counters.byMessageType },
    byStrategyAndType: {
      external_id: { ...counters.byStrategyAndType.external_id },
      text_fallback: { ...counters.byStrategyAndType.text_fallback },
      media_fallback: { ...counters.byStrategyAndType.media_fallback },
    },
    sourceFallback: counters.sourceFallback,
  };
}

/** Returns the N most-recent match events from the ring buffer (default 20), oldest first. */
export function getRecentMatches(limit = 20): MatchEvent[] {
  return recentEvents.slice(-limit);
}

/**
 * E36 — Registra um fallback de fonte do inbox (evo cursor-based → legado
 * zapp.messages): incrementa o counter `source_fallback` e emite o evento
 * `source_switch` (ring buffer). Chamado pelo useInboxSource em modo 'auto'
 * quando o path evo falha.
 */
export function recordSourceFallback(reason: string): void {
  counters.sourceFallback += 1;
  const event: SourceSwitchEvent = { from: 'evo', to: 'zapp', reason, at: Date.now() };
  sourceSwitchEvents.push(event);
  if (sourceSwitchEvents.length > MAX_SOURCE_SWITCH_EVENTS) sourceSwitchEvents.shift();

  if (debugEnabled()) {
    log.warn('[source_switch] fallback evo→zapp', {
      reason,
      total: counters.sourceFallback,
    });
  }
}

/** Returns the N most-recent source-switch (fallback) events (default 20), oldest first. */
export function getSourceSwitchEvents(limit = 20): SourceSwitchEvent[] {
  return sourceSwitchEvents.slice(-limit);
}

/** Subscribes to live reconciliation events; returns an unsubscribe function. */
export function subscribeReconciliation(fn: (ev: MatchEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Resets all counters and clears the ring buffer; intended for tests and manual debug resets. */
export function resetReconciliationStats(): void {
  counters.total = 0;
  counters.byStrategy = { external_id: 0, text_fallback: 0, media_fallback: 0 };
  counters.byMessageType = {};
  counters.byStrategyAndType = {
    external_id: {},
    text_fallback: {},
    media_fallback: {},
  };
  counters.sourceFallback = 0;
  recentEvents.length = 0;
  sourceSwitchEvents.length = 0;
}

// Expõe no window para inspeção rápida em produção via devtools.
if (typeof window !== 'undefined') {
  (window as unknown as { __reconcileStats?: () => Counters }).__reconcileStats = // ignore-audit — window debug exposure for devtools
    getReconciliationStats;
}
