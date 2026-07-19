/**
 * Client-side query telemetry singleton.
 *
 * Aggregates structured events for every external DB call (proxy, RPC, etc.)
 * and exposes counters + latest snapshot in-memory. Snapshot is mirrored on
 * `window.__queryTelemetry` for ad-hoc DevTools inspection.
 *
 * Mirrors the pattern used by `loadOlderMetrics.ts`.
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('clientTelemetry');

export type Severity = 'ok' | 'slow' | 'very_slow' | 'timeout' | 'error';
export type QuerySource = 'externalProxy' | 'externalSupabase' | 'lovableCloud';
export type QueryOperation = 'select' | 'rpc' | 'insert' | 'update' | 'delete';

/** Query Event interface definition. */
export interface QueryEvent {
  operation: QueryOperation;
  source: QuerySource;
  target: string;
  durationMs: number;
  limit: number | null;
  offset: number | null;
  filters: Record<string, unknown> | null;
  recordCount: number | null;
  severity: Severity;
  errorMessage?: string;
  startedAt: number;
  /** Short trace id linking the client log, panel row and edge log. */
  correlationId?: string;
}

export interface TelemetrySnapshot {
  total: number;
  bySeverity: Record<Severity, number>;
  bySource: Record<string, number>;
  avgDurationMs: number;
  p95DurationMs: number;
  recentEvents: QueryEvent[];
  slowEvents: QueryEvent[];
  retry: RetryStats;
}

/** Retry Stats interface definition. */
export interface RetryStats {
  totalRetries: number;
  recoveredAfterRetry: number;
  exhausted: number;
  transientByTarget: Record<string, number>;
}

const RECENT_LIMIT = 50;
const SLOW_LIMIT = 20;

const SLOW_MS = 1500;
const VERY_SLOW_MS = 4000;

interface State {
  total: number;
  bySeverity: Record<Severity, number>;
  bySource: Record<string, number>;
  totalDurationMs: number;
  recentEvents: QueryEvent[];
  slowEvents: QueryEvent[];
  retry: RetryStats;
}

const initialBySeverity = (): Record<Severity, number> => ({
  ok: 0, slow: 0, very_slow: 0, timeout: 0, error: 0,
});

const initialRetry = (): RetryStats => ({
  totalRetries: 0,
  recoveredAfterRetry: 0,
  exhausted: 0,
  transientByTarget: {},
});

const state: State = {
  total: 0,
  bySeverity: initialBySeverity(),
  bySource: {},
  totalDurationMs: 0,
  recentEvents: [],
  slowEvents: [],
  retry: initialRetry(),
};

/** classify Severity function. */
export function classifySeverity(
  durationMs: number,
  hasError: boolean,
  isTimeout: boolean,
): Severity {
  if (isTimeout) return 'timeout';
  if (hasError) return 'error';
  if (durationMs >= VERY_SLOW_MS) return 'very_slow';
  if (durationMs >= SLOW_MS) return 'slow';
  return 'ok';
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

function snapshot(): TelemetrySnapshot {
  const avgDurationMs = state.total > 0 ? Math.round(state.totalDurationMs / state.total) : 0;
  const p95DurationMs = Math.round(p95(state.recentEvents.map((e) => e.durationMs)));
  return {
    total: state.total,
    bySeverity: { ...state.bySeverity },
    bySource: { ...state.bySource },
    avgDurationMs,
    p95DurationMs,
    recentEvents: [...state.recentEvents],
    slowEvents: [...state.slowEvents],
    retry: {
      totalRetries: state.retry.totalRetries,
      recoveredAfterRetry: state.retry.recoveredAfterRetry,
      exhausted: state.retry.exhausted,
      transientByTarget: { ...state.retry.transientByTarget },
    },
  };
}

function publishToWindow() {
  if (typeof window === 'undefined') return;
  (window as unknown as { __queryTelemetry?: TelemetrySnapshot }).__queryTelemetry = snapshot(); // ignore-audit — window debug property not in standard lib
}

function logEvent(ev: QueryEvent) {
  const meta = {
    cid: ev.correlationId,
    source: ev.source,
    op: ev.operation,
    target: ev.target,
    durationMs: ev.durationMs,
    limit: ev.limit,
    offset: ev.offset,
    recordCount: ev.recordCount,
    severity: ev.severity,
    error: ev.errorMessage,
  };
  switch (ev.severity) {
    case 'ok':
      log.debug('query', meta);
      break;
    case 'slow':
      log.info('query slow', meta);
      break;
    case 'very_slow':
    case 'timeout':
    case 'error':
    default:
      log.warn(`query ${ev.severity}`, meta);
      break;
  }
}

/** record Query Event function. */
export function recordQueryEvent(
  ev: Omit<QueryEvent, 'severity'> & { severity?: Severity },
): QueryEvent {
  const severity =
    ev.severity ??
    classifySeverity(ev.durationMs, Boolean(ev.errorMessage), false);

  const fullEvent: QueryEvent = { ...ev, severity };

  state.total += 1;
  state.bySeverity[severity] += 1;
  state.bySource[ev.source] = (state.bySource[ev.source] ?? 0) + 1;
  state.totalDurationMs += ev.durationMs;

  state.recentEvents.push(fullEvent);
  if (state.recentEvents.length > RECENT_LIMIT) {
    state.recentEvents.shift();
  }

  if (severity !== 'ok') {
    state.slowEvents.push(fullEvent);
    if (state.slowEvents.length > SLOW_LIMIT) {
      state.slowEvents.shift();
    }
  }

  logEvent(fullEvent);
  publishToWindow();
  return fullEvent;
}

/** get Telemetry Snapshot function. */
export function getTelemetrySnapshot(): TelemetrySnapshot {
  return snapshot();
}

/** reset Telemetry function. */
export function resetTelemetry(): void {
  state.total = 0;
  state.bySeverity = initialBySeverity();
  state.bySource = {};
  state.totalDurationMs = 0;
  state.recentEvents = [];
  state.slowEvents = [];
  state.retry = initialRetry();
  publishToWindow();
}

/** Retry Outcome interface definition. */
export interface RetryOutcome {
  target: string;
  attempts: number;
  recovered: boolean;
  exhausted: boolean;
  transientCount: number;
  correlationId?: string;
}

/** record Retry Outcome function. */
export function recordRetryOutcome(outcome: RetryOutcome): void {
  const extraAttempts = Math.max(0, outcome.attempts - 1);
  state.retry.totalRetries += extraAttempts;
  if (outcome.recovered) state.retry.recoveredAfterRetry += 1;
  if (outcome.exhausted) state.retry.exhausted += 1;
  if (outcome.transientCount > 0) {
    state.retry.transientByTarget[outcome.target] =
      (state.retry.transientByTarget[outcome.target] ?? 0) + outcome.transientCount;
  }
  publishToWindow();
}

/** T E L E M E T R Y_ T H R E S H O L D S constant. */
export const TELEMETRY_THRESHOLDS = { SLOW_MS, VERY_SLOW_MS };
