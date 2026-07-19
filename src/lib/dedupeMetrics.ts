/**
 * In-memory metrics + event bus for cross-tab dedupe outcomes.
 *
 * Why
 * ---
 * `crossTabDedupe` already logs each leader/follower decision, but those logs
 * are buried in the console. To surface what's actually being deduped between
 * tabs (and prove the feature is doing its job), we keep a small ring buffer
 * of recent events plus running counters per outcome. The admin monitoring
 * panel subscribes to this store and renders a live list.
 *
 * The store is process-local (per tab) and intentionally bounded. It holds
 * no PII — only the dedupe key (which is itself a hash or `req:idem:*`) plus
 * outcome and timestamps.
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('CrossTabDedupeMetrics');

export type DedupeOutcome = 'leader' | 'follower-replay' | 'follower-fallback';

export interface DedupeEvent {
  id: string;
  key: string;
  outcome: DedupeOutcome;
  durationMs: number;
  ok: boolean;
  /** ISO timestamp of when the event was recorded. */
  at: string;
}

export interface DedupeCounters {
  leader: number;
  followerReplay: number;
  followerFallback: number;
  /** Total leader+follower events recorded since the tab loaded. */
  total: number;
  /** Followers that successfully replayed → savings (avoided network call). */
  saved: number;
}

const MAX_EVENTS = 50;

// Anchor the in-memory store on `globalThis` so it survives both Vite HMR
// (which re-evaluates this module) and test-time `vi.resetModules()` calls.
// Without this, two parts of the app holding "different" copies of the
// module would each see their own empty counters.
interface DedupeStore {
  events: DedupeEvent[];
  counters: DedupeCounters;
  listeners: Set<Listener>;
}
type Listener = () => void;

const STORE_KEY = '__zw_dedupe_metrics_store__';
const g = globalThis as unknown as Record<string, DedupeStore | undefined>; // ignore-audit — globalThis extension for HMR-safe singleton store
const store: DedupeStore = g[STORE_KEY] ?? {
  events: [],
  counters: {
    leader: 0,
    followerReplay: 0,
    followerFallback: 0,
    total: 0,
    saved: 0,
  },
  listeners: new Set<Listener>(),
};
g[STORE_KEY] = store;

const events = store.events;
const counters = store.counters;
const listeners = store.listeners;

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      log.warn('listener threw', e);
    }
  }
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Internal — called by `crossTabSendDedupe`. Public for tests. */
export function recordDedupeEvent(input: {
  key: string;
  outcome: DedupeOutcome;
  durationMs: number;
  ok: boolean;
}): DedupeEvent {
  const ev: DedupeEvent = {
    id: genId(),
    key: input.key,
    outcome: input.outcome,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    ok: input.ok,
    at: new Date().toISOString(),
  };
  events.unshift(ev);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;

  counters.total += 1;
  if (ev.outcome === 'leader') counters.leader += 1;
  else if (ev.outcome === 'follower-replay') {
    counters.followerReplay += 1;
    if (ev.ok) counters.saved += 1;
  } else counters.followerFallback += 1;

  // Structured log so it shows up in the existing console pipeline too.
  log.info('event', ev);

  // Best-effort DOM event so anything outside React (e.g. devtools panels) can react.
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zappweb:dedupe-event', { detail: ev }));
    }
  } catch {
    /* no-op */
  }

  notify();
  return ev;
}

/** Subscribes to cross-tab dedupe event notifications; returns an unsubscribe function. */
export function subscribeDedupeEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** get Dedupe Snapshot function. */
export function getDedupeSnapshot(): { events: DedupeEvent[]; counters: DedupeCounters } {
  return {
    events: events.slice(),
    counters: { ...counters },
  };
}

/** Test/cleanup helper. */
export function __resetDedupeMetricsForTests() {
  events.length = 0;
  counters.leader = 0;
  counters.followerReplay = 0;
  counters.followerFallback = 0;
  counters.total = 0;
  counters.saved = 0;
  listeners.clear();
}
