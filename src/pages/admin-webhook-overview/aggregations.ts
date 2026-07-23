/**
 * Pure aggregation helpers for the Webhook Overview page.
 * Kept separate from the page so they can be unit-tested.
 */

/** Webhook Event Lite interface. */
export interface WebhookEventLite {
  event_type: string;
  instance_name: string;
  processed: boolean;
  error_message: string | null;
  created_at: string;
}

/** Type Aggregate interface definition. */
export interface TypeAggregate {
  type: string;
  total: number;
  processed: number;
  errored: number;
  lastAt: string | null;
}

/** Matrix Aggregate interface definition. */
export interface MatrixAggregate {
  types: string[];
  instances: string[];
  matrix: Record<string, Record<string, number>>;
}

/** Hourly Bucket interface definition. */
export interface HourlyBucket {
  bucket: string;
  /** ISO timestamp at the start of the bucket — kept for sorting. */
  bucketTs: number;
  processed: number;
  errored: number;
}

/** Counts events per type, with processed / errored breakdown and most recent timestamp. */
export function aggregateByType(rows: WebhookEventLite[]): TypeAggregate[] {
  const map = new Map<string, TypeAggregate>();
  for (const r of rows) {
    const prev = map.get(r.event_type) ?? {
      type: r.event_type,
      total: 0,
      processed: 0,
      errored: 0,
      lastAt: null as string | null,
    };
    prev.total += 1;
    if (r.error_message) prev.errored += 1;
    if (r.processed && !r.error_message) prev.processed += 1;
    if (!prev.lastAt || new Date(r.created_at) > new Date(prev.lastAt)) {
      prev.lastAt = r.created_at;
    }
    map.set(r.event_type, prev);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Builds a `type × instance` matrix of event counts. */
export function aggregateByTypeAndInstance(rows: WebhookEventLite[]): MatrixAggregate {
  const types = new Set<string>();
  const instances = new Set<string>();
  const matrix: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    types.add(r.event_type);
    instances.add(r.instance_name);
    matrix[r.event_type] ??= {};
    matrix[r.event_type][r.instance_name] = (matrix[r.event_type][r.instance_name] ?? 0) + 1;
  }
  return {
    types: [...types].sort((a, b) => {
      const ta = Object.values(matrix[a] ?? {}).reduce((s, n) => s + n, 0);
      const tb = Object.values(matrix[b] ?? {}).reduce((s, n) => s + n, 0);
      return tb - ta;
    }),
    instances: [...instances].sort(),
    matrix,
  };
}

/**
 * Builds time-series buckets covering the last `hours` hours.
 * Bucket size is 1h for ≤24h, 6h for >24h.
 */
export function aggregateHourly(rows: WebhookEventLite[], hours: number): HourlyBucket[] {
  const bucketHours = hours <= 24 ? 1 : 6;
  const bucketMs = bucketHours * 60 * 60 * 1000;
  const now = Date.now();
  const start = Math.floor((now - hours * 60 * 60 * 1000) / bucketMs) * bucketMs;
  const buckets = new Map<number, HourlyBucket>();

  // Pre-seed empty buckets so the chart shows continuous time even when sparse.
  for (let t = start; t <= now; t += bucketMs) {
    buckets.set(t, {
      bucket: formatBucketLabel(t, bucketHours),
      bucketTs: t,
      processed: 0,
      errored: 0,
    });
  }

  for (const r of rows) {
    const ts = new Date(r.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    const key = Math.floor(ts / bucketMs) * bucketMs;
    const b = buckets.get(key);
    if (!b) continue;
    if (r.error_message) b.errored += 1;
    else if (r.processed) b.processed += 1;
  }

  return [...buckets.values()].sort((a, b) => a.bucketTs - b.bucketTs);
}

function formatBucketLabel(ts: number, bucketHours: number): string {
  const d = new Date(ts);
  if (bucketHours >= 6) {
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' });
  }
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Returns a semantic Tailwind text-color token based on the event category. */
export function categoryColor(eventType: string): string {
  const t = eventType.toUpperCase();
  if (t.startsWith('MESSAGES')) return 'text-primary';
  if (t.includes('CONNECTION') || t.includes('QRCODE')) return 'text-warning';
  if (t.includes('PRESENCE') || t.includes('CHATS') || t.includes('CONTACTS')) return 'text-muted-foreground';
  if (t.includes('CALL')) return 'text-accent-foreground';
  if (t.includes('LABELS')) return 'text-secondary-foreground';
  return 'text-foreground';
}

/** Returns a semantic fill color (Tailwind hsl token) for use in recharts. */
export function categoryFill(eventType: string): string {
  const t = eventType.toUpperCase();
  if (t.startsWith('MESSAGES')) return 'hsl(var(--primary))';
  if (t.includes('CONNECTION') || t.includes('QRCODE')) return 'hsl(var(--warning))';
  if (t.includes('PRESENCE') || t.includes('CHATS') || t.includes('CONTACTS')) return 'hsl(var(--muted-foreground))';
  if (t.includes('CALL')) return 'hsl(var(--accent))';
  if (t.includes('LABELS')) return 'hsl(var(--secondary))';
  return 'hsl(var(--foreground))';
}
