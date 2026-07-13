import { describe, it, expect } from 'vitest';
import {
  shouldFireRetryAlert,
  buildRetryAlertDedupeKey,
  resolveThresholds,
  evaluateInstance,
  evaluateAllInstances,
  DEFAULT_THRESHOLDS,
  RETRY_ALERT_COOLDOWN_MS,
  DEFAULT_RETRY_DEDUPE_MODE,
} from '@/lib/retryAlerts';
import type {
  InstanceMetrics,
  RetryThresholds,
  PerInstanceThresholds,
} from '@/lib/retryAlerts';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<InstanceMetrics> = {}): InstanceMetrics {
  return {
    instance: 'whatsapp-main',
    total: 10,
    successAfterRetry: 5,
    failed: 1,
    exhausted: 1,
    p95Attempts: 1,
    failureRatePct: 5,
    ...overrides,
  };
}

function makeThresholds(overrides: Partial<RetryThresholds> = {}): RetryThresholds {
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

// ── DEFAULT_THRESHOLDS ────────────────────────────────────────────────────────

describe('DEFAULT_THRESHOLDS', () => {
  it('has p95Attempts = 3', () => {
    expect(DEFAULT_THRESHOLDS.p95Attempts).toBe(3);
  });

  it('has failureRatePct = 20', () => {
    expect(DEFAULT_THRESHOLDS.failureRatePct).toBe(20);
  });

  it('has minSampleSize = 5', () => {
    expect(DEFAULT_THRESHOLDS.minSampleSize).toBe(5);
  });
});

describe('RETRY_ALERT_COOLDOWN_MS', () => {
  it('equals 5 minutes in ms', () => {
    expect(RETRY_ALERT_COOLDOWN_MS).toBe(5 * 60 * 1000);
  });
});

describe('DEFAULT_RETRY_DEDUPE_MODE', () => {
  it('is "instance+kind"', () => {
    expect(DEFAULT_RETRY_DEDUPE_MODE).toBe('instance+kind');
  });
});

// ── shouldFireRetryAlert ──────────────────────────────────────────────────────

describe('shouldFireRetryAlert — first call', () => {
  it('returns true when key has never fired', () => {
    const map = new Map<string, number>();
    expect(shouldFireRetryAlert('k1', 1000, map, 5000)).toBe(true);
  });

  it('sets nowMs in the map after firing', () => {
    const map = new Map<string, number>();
    shouldFireRetryAlert('k1', 1000, map, 9000);
    expect(map.get('k1')).toBe(9000);
  });
});

describe('shouldFireRetryAlert — cooldown enforcement', () => {
  it('returns false when cooldown has not elapsed', () => {
    const map = new Map<string, number>([['k', 1000]]);
    // nowMs=2000, last=1000, cooldown=2000 → diff=1000 < 2000 → false
    expect(shouldFireRetryAlert('k', 2000, map, 2000)).toBe(false);
  });

  it('returns false when elapsed exactly equals cooldown minus 1ms', () => {
    const map = new Map<string, number>([['k', 0]]);
    expect(shouldFireRetryAlert('k', 1000, map, 999)).toBe(false);
  });

  it('returns true when elapsed equals cooldown exactly', () => {
    const map = new Map<string, number>([['k', 0]]);
    // nowMs - last = 1000, cooldown = 1000 → NOT < cooldown → fires
    expect(shouldFireRetryAlert('k', 1000, map, 1000)).toBe(true);
  });

  it('returns true when elapsed is greater than cooldown', () => {
    const map = new Map<string, number>([['k', 0]]);
    expect(shouldFireRetryAlert('k', 1000, map, 5000)).toBe(true);
  });

  it('updates the map timestamp when firing after cooldown', () => {
    const map = new Map<string, number>([['k', 0]]);
    shouldFireRetryAlert('k', 1000, map, 5000);
    expect(map.get('k')).toBe(5000);
  });

  it('does not update map when returning false', () => {
    const map = new Map<string, number>([['k', 1000]]);
    shouldFireRetryAlert('k', 5000, map, 2000);
    expect(map.get('k')).toBe(1000);
  });
});

describe('shouldFireRetryAlert — key isolation', () => {
  it('different keys are independent', () => {
    const map = new Map<string, number>([['a', 9000]]);
    // 'a' is within cooldown, 'b' has never fired
    expect(shouldFireRetryAlert('a', 5000, map, 10000)).toBe(false);
    expect(shouldFireRetryAlert('b', 5000, map, 10000)).toBe(true);
  });

  it('firing one key does not affect another', () => {
    const map = new Map<string, number>();
    shouldFireRetryAlert('x', 100, map, 200);
    // 'y' still not in map
    expect(shouldFireRetryAlert('y', 100, map, 200)).toBe(true);
  });
});

// ── buildRetryAlertDedupeKey ──────────────────────────────────────────────────

describe('buildRetryAlertDedupeKey — instance+kind mode', () => {
  it('includes instance, kind, and hours', () => {
    const key = buildRetryAlertDedupeKey('main', 'p95', 1, 'instance+kind');
    expect(key).toBe('main|p95|1h');
  });

  it('uses default mode (instance+kind) when omitted', () => {
    const key = buildRetryAlertDedupeKey('main', 'failure_rate', 4);
    expect(key).toBe('main|failure_rate|4h');
  });

  it('different kind values produce different keys', () => {
    const k1 = buildRetryAlertDedupeKey('inst', 'p95', 1, 'instance+kind');
    const k2 = buildRetryAlertDedupeKey('inst', 'failure_rate', 1, 'instance+kind');
    expect(k1).not.toBe(k2);
  });

  it('different hours produce different keys', () => {
    const k1 = buildRetryAlertDedupeKey('inst', 'p95', 1, 'instance+kind');
    const k2 = buildRetryAlertDedupeKey('inst', 'p95', 24, 'instance+kind');
    expect(k1).not.toBe(k2);
  });
});

describe('buildRetryAlertDedupeKey — instance mode', () => {
  it('returns instance|hours without kind', () => {
    const key = buildRetryAlertDedupeKey('main', 'p95', 1, 'instance');
    expect(key).toBe('main|1h');
  });

  it('same key regardless of kind in instance mode', () => {
    const k1 = buildRetryAlertDedupeKey('inst', 'p95', 2, 'instance');
    const k2 = buildRetryAlertDedupeKey('inst', 'failure_rate', 2, 'instance');
    expect(k1).toBe(k2);
  });

  it('different hours still differ in instance mode', () => {
    const k1 = buildRetryAlertDedupeKey('inst', 'p95', 1, 'instance');
    const k2 = buildRetryAlertDedupeKey('inst', 'p95', 24, 'instance');
    expect(k1).not.toBe(k2);
  });
});

// ── resolveThresholds ─────────────────────────────────────────────────────────

describe('resolveThresholds — no override', () => {
  it('returns globals when instance has no entry', () => {
    const globals = makeThresholds();
    const result = resolveThresholds('unknown-instance', globals, {});
    expect(result).toEqual(globals);
  });

  it('returns globals when overrides map is empty', () => {
    const globals = makeThresholds({ p95Attempts: 5 });
    const result = resolveThresholds('inst', globals, {});
    expect(result.p95Attempts).toBe(5);
  });
});

describe('resolveThresholds — partial overrides', () => {
  it('overrides only p95Attempts, keeps other globals', () => {
    const globals = makeThresholds({ p95Attempts: 3, failureRatePct: 20, minSampleSize: 5 });
    const overrides: PerInstanceThresholds = { 'inst': { p95Attempts: 10 } };
    const result = resolveThresholds('inst', globals, overrides);
    expect(result.p95Attempts).toBe(10);
    expect(result.failureRatePct).toBe(20);
    expect(result.minSampleSize).toBe(5);
  });

  it('overrides only failureRatePct', () => {
    const globals = makeThresholds({ failureRatePct: 20 });
    const overrides: PerInstanceThresholds = { 'inst': { failureRatePct: 50 } };
    const result = resolveThresholds('inst', globals, overrides);
    expect(result.failureRatePct).toBe(50);
    expect(result.p95Attempts).toBe(globals.p95Attempts);
  });

  it('overrides only minSampleSize', () => {
    const globals = makeThresholds({ minSampleSize: 5 });
    const overrides: PerInstanceThresholds = { 'inst': { minSampleSize: 2 } };
    const result = resolveThresholds('inst', globals, overrides);
    expect(result.minSampleSize).toBe(2);
  });
});

describe('resolveThresholds — full override', () => {
  it('all fields from override when all provided', () => {
    const globals = makeThresholds({ p95Attempts: 3, failureRatePct: 20, minSampleSize: 5 });
    const overrides: PerInstanceThresholds = {
      'inst': { p95Attempts: 10, failureRatePct: 50, minSampleSize: 2 },
    };
    const result = resolveThresholds('inst', globals, overrides);
    expect(result).toEqual({ p95Attempts: 10, failureRatePct: 50, minSampleSize: 2 });
  });
});

describe('resolveThresholds — 0 is a valid override value', () => {
  it('accepts 0 as a valid p95Attempts override', () => {
    const globals = makeThresholds({ p95Attempts: 3 });
    const overrides: PerInstanceThresholds = { 'inst': { p95Attempts: 0 } };
    const result = resolveThresholds('inst', globals, overrides);
    expect(result.p95Attempts).toBe(0);
  });
});

// ── evaluateInstance ──────────────────────────────────────────────────────────

describe('evaluateInstance — sample size guard', () => {
  it('returns not-breached when total < minSampleSize', () => {
    const metrics = makeMetrics({ total: 4, p95Attempts: 99, failureRatePct: 99 });
    const result = evaluateInstance(metrics, makeThresholds({ minSampleSize: 5 }));
    expect(result.breached).toBe(false);
    expect(result.reasons).toHaveLength(0);
    expect(result.details).toHaveLength(0);
  });

  it('evaluates when total equals minSampleSize', () => {
    const metrics = makeMetrics({ total: 5, p95Attempts: 5, failureRatePct: 0 });
    const result = evaluateInstance(metrics, makeThresholds({ minSampleSize: 5 }));
    expect(result.breached).toBe(true);
  });
});

describe('evaluateInstance — p95 breach', () => {
  it('breaches when p95Attempts >= threshold', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 3, failureRatePct: 0 });
    const thresholds = makeThresholds({ p95Attempts: 3, failureRatePct: 100 });
    const result = evaluateInstance(metrics, thresholds);
    expect(result.breached).toBe(true);
    expect(result.details[0].kind).toBe('p95');
  });

  it('does not breach when p95Attempts < threshold', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 2, failureRatePct: 0 });
    const thresholds = makeThresholds({ p95Attempts: 3, failureRatePct: 100 });
    const result = evaluateInstance(metrics, thresholds);
    expect(result.breached).toBe(false);
  });

  it('p95 detail has correct observed and threshold values', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 5 });
    const thresholds = makeThresholds({ p95Attempts: 3, failureRatePct: 100 });
    const detail = evaluateInstance(metrics, thresholds).details[0];
    expect(detail.observed).toBe(5);
    expect(detail.threshold).toBe(3);
  });

  it('p95 label contains observed and threshold', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 5 });
    const thresholds = makeThresholds({ p95Attempts: 3, failureRatePct: 100 });
    const { label } = evaluateInstance(metrics, thresholds).details[0];
    expect(label).toContain('5');
    expect(label).toContain('3');
  });
});

describe('evaluateInstance — failure_rate breach', () => {
  it('breaches when failureRatePct >= threshold', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 1, failureRatePct: 20 });
    const thresholds = makeThresholds({ p95Attempts: 99, failureRatePct: 20 });
    const result = evaluateInstance(metrics, thresholds);
    expect(result.breached).toBe(true);
    expect(result.details[0].kind).toBe('failure_rate');
  });

  it('does not breach when failureRatePct < threshold', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 1, failureRatePct: 19 });
    const thresholds = makeThresholds({ p95Attempts: 99, failureRatePct: 20 });
    const result = evaluateInstance(metrics, thresholds);
    expect(result.breached).toBe(false);
  });

  it('failure_rate detail has correct observed and threshold values', () => {
    const metrics = makeMetrics({ total: 10, failureRatePct: 30 });
    const thresholds = makeThresholds({ failureRatePct: 20, p95Attempts: 99 });
    const detail = evaluateInstance(metrics, thresholds).details[0];
    expect(detail.observed).toBe(30);
    expect(detail.threshold).toBe(20);
  });
});

describe('evaluateInstance — both breaches', () => {
  it('returns two details when both p95 and failure_rate breach', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 5, failureRatePct: 50 });
    const thresholds = makeThresholds({ p95Attempts: 3, failureRatePct: 20 });
    const result = evaluateInstance(metrics, thresholds);
    expect(result.breached).toBe(true);
    expect(result.details).toHaveLength(2);
    expect(result.details.map(d => d.kind)).toEqual(['p95', 'failure_rate']);
  });

  it('reasons array matches details labels', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 5, failureRatePct: 50 });
    const thresholds = makeThresholds({ p95Attempts: 3, failureRatePct: 20 });
    const result = evaluateInstance(metrics, thresholds);
    expect(result.reasons).toEqual(result.details.map(d => d.label));
  });
});

describe('evaluateInstance — no breach', () => {
  it('returns breached=false with empty arrays when all metrics ok', () => {
    const metrics = makeMetrics({ total: 10, p95Attempts: 1, failureRatePct: 5 });
    const thresholds = makeThresholds({ p95Attempts: 3, failureRatePct: 20 });
    const result = evaluateInstance(metrics, thresholds);
    expect(result.breached).toBe(false);
    expect(result.reasons).toHaveLength(0);
    expect(result.details).toHaveLength(0);
  });
});

// ── evaluateAllInstances ──────────────────────────────────────────────────────

describe('evaluateAllInstances — empty input', () => {
  it('returns [] for empty metrics array', () => {
    expect(evaluateAllInstances([], makeThresholds())).toEqual([]);
  });
});

describe('evaluateAllInstances — filtering', () => {
  it('returns [] when no instance breaches', () => {
    const metrics = [
      makeMetrics({ instance: 'a', p95Attempts: 1, failureRatePct: 5 }),
      makeMetrics({ instance: 'b', p95Attempts: 2, failureRatePct: 10 }),
    ];
    expect(evaluateAllInstances(metrics, makeThresholds())).toHaveLength(0);
  });

  it('returns only the breaching instances', () => {
    const metrics = [
      makeMetrics({ instance: 'ok', p95Attempts: 1, failureRatePct: 5 }),
      makeMetrics({ instance: 'bad', p95Attempts: 10, failureRatePct: 5 }),
    ];
    const result = evaluateAllInstances(metrics, makeThresholds());
    expect(result).toHaveLength(1);
    expect(result[0].instance).toBe('bad');
  });

  it('returns all breaching instances when multiple breach', () => {
    const metrics = [
      makeMetrics({ instance: 'a', p95Attempts: 10, failureRatePct: 5 }),
      makeMetrics({ instance: 'b', p95Attempts: 10, failureRatePct: 5 }),
    ];
    const result = evaluateAllInstances(metrics, makeThresholds());
    expect(result).toHaveLength(2);
  });
});

describe('evaluateAllInstances — InstanceBreach shape', () => {
  it('includes instance, reasons, details, metrics, effectiveThresholds, hasOverride', () => {
    const m = makeMetrics({ instance: 'main', p95Attempts: 10 });
    const [breach] = evaluateAllInstances([m], makeThresholds());
    expect(breach.instance).toBe('main');
    expect(Array.isArray(breach.reasons)).toBe(true);
    expect(Array.isArray(breach.details)).toBe(true);
    expect(breach.metrics).toEqual(m);
    expect(typeof breach.hasOverride).toBe('boolean');
    expect(breach.effectiveThresholds).toBeDefined();
  });

  it('hasOverride is false when no overrides provided', () => {
    const m = makeMetrics({ instance: 'main', p95Attempts: 10 });
    const [breach] = evaluateAllInstances([m], makeThresholds());
    expect(breach.hasOverride).toBe(false);
  });
});

describe('evaluateAllInstances — with overrides', () => {
  it('applies per-instance override to threshold', () => {
    const m = makeMetrics({ instance: 'strict', total: 10, p95Attempts: 2, failureRatePct: 5 });
    // Global threshold: p95 must be ≥3 to alert, but override lowers it to 1
    const overrides: PerInstanceThresholds = { strict: { p95Attempts: 1 } };
    const result = evaluateAllInstances([m], makeThresholds({ p95Attempts: 3 }), overrides);
    expect(result).toHaveLength(1);
    expect(result[0].hasOverride).toBe(true);
  });

  it('effectiveThresholds reflects the merged override', () => {
    const m = makeMetrics({ instance: 'inst', p95Attempts: 10 });
    const overrides: PerInstanceThresholds = { inst: { p95Attempts: 1 } };
    const [breach] = evaluateAllInstances([m], makeThresholds(), overrides);
    expect(breach.effectiveThresholds.p95Attempts).toBe(1);
  });

  it('hasOverride is false for instances without override entry', () => {
    const m = makeMetrics({ instance: 'no-override', p95Attempts: 10 });
    const overrides: PerInstanceThresholds = { 'other': { p95Attempts: 1 } };
    const [breach] = evaluateAllInstances([m], makeThresholds(), overrides);
    expect(breach.hasOverride).toBe(false);
  });

  it('preserves global threshold for instances not in overrides', () => {
    const m = makeMetrics({ instance: 'no-override', p95Attempts: 10 });
    const overrides: PerInstanceThresholds = {};
    const [breach] = evaluateAllInstances([m], makeThresholds({ p95Attempts: 3 }), overrides);
    expect(breach.effectiveThresholds.p95Attempts).toBe(3);
  });
});
