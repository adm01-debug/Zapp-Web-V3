/**
 * Pure aggregation helpers for the Webhook Secret Status page.
 * All functions are deterministic and unit-testable.
 */

/** Secret Status Event interface. */
export interface SecretStatusEvent {
  id?: string;
  event_type: string;
  instance_name: string | null;
  signature_valid: boolean | null;
  processed: boolean | null;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

/** Instance Validation Stats interface definition. */
export interface InstanceValidationStats {
  instance: string;
  total: number;
  validated: number;
  invalid: number;
  unsigned: number;
  errored: number;
  validationRate: number; // 0-100, -1 if total === 0
  lastEventAt: string | null;
}

/** Instance Live Status interface definition. */
export interface InstanceLiveStatus {
  lastEvent: { type: string; createdAt: string } | null;
  recentTotal: number; // last 5 minutes
  recentProcessed: number;
  recentErrored: number;
  /** Last 5 min in 30s buckets, processed minus errored ordered ascending. */
  sparkline: number[];
}

/** Latency Stats interface. */
export interface LatencyStats {
  /** Average latency in milliseconds (last hour) — null if no samples. */
  avgMs: number | null;
  /** P95 latency in ms — null if no samples. */
  p95Ms: number | null;
  samples: number;
}

const INSTANCE_FALLBACK = '—';

/** Aggregates validation stats per instance over the provided rows. */
export function aggregateValidationByInstance(
  rows: SecretStatusEvent[],
): InstanceValidationStats[] {
  const map = new Map<string, InstanceValidationStats>();
  for (const r of rows) {
    const key = r.instance_name || INSTANCE_FALLBACK;
    const prev =
      map.get(key) ??
      ({
        instance: key,
        total: 0,
        validated: 0,
        invalid: 0,
        unsigned: 0,
        errored: 0,
        validationRate: 0,
        lastEventAt: null,
      } satisfies InstanceValidationStats);
    prev.total += 1;
    if (r.signature_valid === true) prev.validated += 1;
    else if (r.signature_valid === false) prev.invalid += 1;
    else prev.unsigned += 1;
    if (r.error_message) prev.errored += 1;
    if (!prev.lastEventAt || new Date(r.created_at) > new Date(prev.lastEventAt)) {
      prev.lastEventAt = r.created_at;
    }
    map.set(key, prev);
  }
  for (const stat of map.values()) {
    stat.validationRate =
      stat.total > 0 ? Math.round((stat.validated / stat.total) * 10000) / 100 : -1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Computes live status for a given instance (or all instances when instance is null). */
export function computeInstanceStatus(
  rows: SecretStatusEvent[],
  instance: string | null,
): InstanceLiveStatus {
  const filtered = instance
    ? rows.filter((r) => (r.instance_name || INSTANCE_FALLBACK) === instance)
    : rows;

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const lastEvent = sorted[0]
    ? { type: sorted[0].event_type, createdAt: sorted[0].created_at }
    : null;

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recent = filtered.filter((r) => new Date(r.created_at).getTime() >= fiveMinAgo);
  const recentProcessed = recent.filter((r) => r.processed && !r.error_message).length;
  const recentErrored = recent.filter((r) => !!r.error_message).length;

  // Sparkline — 30s buckets across last 5 minutes (10 buckets).
  const bucketMs = 30 * 1000;
  const buckets = new Array<number>(10).fill(0);
  for (const r of recent) {
    const offset = Date.now() - new Date(r.created_at).getTime();
    const idx = 9 - Math.min(9, Math.floor(offset / bucketMs));
    if (idx >= 0 && idx < 10) buckets[idx] += 1;
  }

  return {
    lastEvent,
    recentTotal: recent.length,
    recentProcessed,
    recentErrored,
    sparkline: buckets,
  };
}

/** Computes latency statistics from processed_at - created_at over the rows. */
export function computeLatencyStats(rows: SecretStatusEvent[]): LatencyStats {
  const samples: number[] = [];
  for (const r of rows) {
    if (!r.processed_at || !r.created_at) continue;
    const created = new Date(r.created_at).getTime();
    const processed = new Date(r.processed_at).getTime();
    if (Number.isNaN(created) || Number.isNaN(processed)) continue;
    const delta = processed - created;
    if (delta < 0 || delta > 5 * 60 * 1000) continue; // clamp absurd values
    samples.push(delta);
  }
  if (samples.length === 0) {
    return { avgMs: null, p95Ms: null, samples: 0 };
  }
  samples.sort((a, b) => a - b);
  const avgMs = Math.round(samples.reduce((s, n) => s + n, 0) / samples.length);
  const p95Idx = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
  return { avgMs, p95Ms: samples[p95Idx], samples: samples.length };
}

/** Derives a sorted unique list of instances from the rows. */
export function deriveInstances(rows: SecretStatusEvent[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.instance_name) set.add(r.instance_name);
  }
  return [...set].sort();
}
