/**
 * Lightweight in-memory metrics for the "load older messages" lifecycle.
 *
 * Tracks 3 counters (started, cancelled, completed) plus a rolling timing
 * histogram so we can spot regressions in scroll UX and pagination perf.
 *
 * Counters and the latest snapshot are exposed on `window.__loadOlderMetrics`
 * for ad-hoc inspection in DevTools (no UI yet).
 */

import { getLogger } from '@/lib/logger';

const log = getLogger('loadOlderMetrics');

export interface LoadOlderSnapshot {
  started: number;
  cancelled: number;
  completed: number;
  /** completed / started — useful to spot users who keep aborting. */
  completionRate: number;
  /** Average duration (ms) of completed loads. */
  avgDurationMs: number;
  /** Last N durations (ms) of completed loads, newest last. */
  recentDurationsMs: number[];
}

const RECENT_LIMIT = 20;

interface State {
  started: number;
  cancelled: number;
  completed: number;
  recentDurationsMs: number[];
  totalDurationMs: number;
}

const state: State = {
  started: 0,
  cancelled: 0,
  completed: 0,
  recentDurationsMs: [],
  totalDurationMs: 0,
};

function snapshot(): LoadOlderSnapshot {
  const avgDurationMs = state.completed > 0 ? state.totalDurationMs / state.completed : 0;
  const completionRate = state.started > 0 ? state.completed / state.started : 0;
  return {
    started: state.started,
    cancelled: state.cancelled,
    completed: state.completed,
    completionRate,
    avgDurationMs,
    recentDurationsMs: [...state.recentDurationsMs],
  };
}

function publishToWindow() {
  if (typeof window === 'undefined') return;
  (window as unknown as { __loadOlderMetrics?: LoadOlderSnapshot }).__loadOlderMetrics = snapshot(); // ignore-audit — window debug property for devtools inspection
}

export function recordLoadOlderStarted(meta?: Record<string, unknown>): number {
  state.started += 1;
  const startedAt = performance.now();
  log.info('loadOlder:started', { count: state.started, ...meta });
  publishToWindow();
  return startedAt;
}

export function recordLoadOlderCancelled(startedAt: number | null, meta?: Record<string, unknown>): void {
  state.cancelled += 1;
  const elapsed = startedAt != null ? Math.round(performance.now() - startedAt) : null;
  log.warn('loadOlder:cancelled', { count: state.cancelled, elapsedMs: elapsed, ...meta });
  publishToWindow();
}

export function recordLoadOlderCompleted(startedAt: number, meta?: Record<string, unknown>): void {
  state.completed += 1;
  const elapsed = Math.round(performance.now() - startedAt);
  state.totalDurationMs += elapsed;
  state.recentDurationsMs.push(elapsed);
  if (state.recentDurationsMs.length > RECENT_LIMIT) {
    state.recentDurationsMs.shift();
  }
  log.info('loadOlder:completed', { count: state.completed, durationMs: elapsed, ...meta });
  publishToWindow();
}

export function getLoadOlderMetrics(): LoadOlderSnapshot {
  return snapshot();
}

export function resetLoadOlderMetrics(): void {
  state.started = 0;
  state.cancelled = 0;
  state.completed = 0;
  state.totalDurationMs = 0;
  state.recentDurationsMs = [];
  publishToWindow();
}
