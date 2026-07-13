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

export type MatchStrategy = 'external_id' | 'text_fallback' | 'media_fallback';

export interface MatchEvent {
  strategy: MatchStrategy;
  messageType: string;
  optimisticId: string;
  canonicalId: string;
  /** ms entre created_at otimista e canônico (apenas fallbacks). */
  deltaMs?: number;
  at: number;
}

interface Counters {
  total: number;
  byStrategy: Record<MatchStrategy, number>;
  byMessageType: Record<string, number>;
  /** matrix [strategy][messageType] -> count */
  byStrategyAndType: Record<MatchStrategy, Record<string, number>>;
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
};

const recentEvents: MatchEvent[] = [];
const MAX_RECENT = 100;
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
  };
}

export function getRecentMatches(limit = 20): MatchEvent[] {
  return recentEvents.slice(-limit);
}

export function subscribeReconciliation(fn: (ev: MatchEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetReconciliationStats(): void {
  counters.total = 0;
  counters.byStrategy = { external_id: 0, text_fallback: 0, media_fallback: 0 };
  counters.byMessageType = {};
  counters.byStrategyAndType = {
    external_id: {},
    text_fallback: {},
    media_fallback: {},
  };
  recentEvents.length = 0;
}

// Expõe no window para inspeção rápida em produção via devtools.
if (typeof window !== 'undefined') {
  (window as unknown as { __reconcileStats?: () => Counters }).__reconcileStats = // ignore-audit — window debug exposure for devtools
    getReconciliationStats;
}
