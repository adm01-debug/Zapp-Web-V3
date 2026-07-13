import { describe, it, expect } from 'vitest';
import {
  evaluateInstanceHealth,
  evaluateAllInstances,
  shouldFireAlert,
  DEFAULT_ALERT_CONFIG,
  ALERT_COOLDOWN_MS,
} from '@/lib/webhookHealthAlerts';
import type {
  InstanceHealthStats,
  WebhookAlertConfig,
} from '@/lib/webhookHealthAlerts';

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW_MS = 1_000_000_000; // fixed reference time

function makeStats(overrides: Partial<InstanceHealthStats> = {}): InstanceHealthStats {
  return {
    instance: 'whatsapp-main',
    total: 30,
    invalid: 0,
    total24h: 100,
    lastEventAt: new Date(NOW_MS - 60_000).toISOString(), // 1 minute ago
    ...overrides,
  };
}

function makeConfig(overrides: Partial<WebhookAlertConfig> = {}): WebhookAlertConfig {
  return { ...DEFAULT_ALERT_CONFIG, ...overrides };
}

// ── DEFAULT_ALERT_CONFIG constants ────────────────────────────────────────────

describe('DEFAULT_ALERT_CONFIG', () => {
  it('invalidRatePct is 5', () => {
    expect(DEFAULT_ALERT_CONFIG.invalidRatePct).toBe(5);
  });

  it('minSampleSize is 20', () => {
    expect(DEFAULT_ALERT_CONFIG.minSampleSize).toBe(20);
  });

  it('silenceMinutes is 10', () => {
    expect(DEFAULT_ALERT_CONFIG.silenceMinutes).toBe(10);
  });

  it('enabled is true', () => {
    expect(DEFAULT_ALERT_CONFIG.enabled).toBe(true);
  });
});

describe('ALERT_COOLDOWN_MS', () => {
  it('equals 5 minutes', () => {
    expect(ALERT_COOLDOWN_MS).toBe(5 * 60 * 1000);
  });
});

// ── evaluateInstanceHealth — disabled ────────────────────────────────────────

describe('evaluateInstanceHealth — disabled config', () => {
  it('returns [] when config.enabled=false regardless of metrics', () => {
    const stats = makeStats({ total: 100, invalid: 100 });
    const result = evaluateInstanceHealth(stats, makeConfig({ enabled: false }), NOW_MS);
    expect(result).toHaveLength(0);
  });
});

// ── evaluateInstanceHealth — signature_spike ──────────────────────────────────

describe('evaluateInstanceHealth — signature_spike', () => {
  it('returns no breach when invalid rate is below threshold', () => {
    const stats = makeStats({ total: 100, invalid: 4, total24h: 100 });
    // rate=4%, threshold=5% → no breach
    const result = evaluateInstanceHealth(stats, makeConfig({ invalidRatePct: 5 }), NOW_MS);
    const spike = result.filter(b => b.type === 'signature_spike');
    expect(spike).toHaveLength(0);
  });

  it('returns breach when invalid rate equals threshold', () => {
    const stats = makeStats({ total: 100, invalid: 5, total24h: 100 });
    // rate=5%, threshold=5% → breach
    const result = evaluateInstanceHealth(stats, makeConfig({ invalidRatePct: 5 }), NOW_MS);
    const spike = result.filter(b => b.type === 'signature_spike');
    expect(spike).toHaveLength(1);
  });

  it('returns breach when invalid rate exceeds threshold', () => {
    const stats = makeStats({ total: 100, invalid: 20, total24h: 100 });
    const result = evaluateInstanceHealth(stats, makeConfig({ invalidRatePct: 5 }), NOW_MS);
    expect(result.some(b => b.type === 'signature_spike')).toBe(true);
  });

  it('skips evaluation when total < minSampleSize', () => {
    const stats = makeStats({ total: 5, invalid: 5, total24h: 100 });
    const result = evaluateInstanceHealth(stats, makeConfig({ minSampleSize: 20 }), NOW_MS);
    const spike = result.filter(b => b.type === 'signature_spike');
    expect(spike).toHaveLength(0);
  });

  it('evaluates when total equals minSampleSize', () => {
    const stats = makeStats({ total: 20, invalid: 2, total24h: 100 });
    // rate=10%, threshold=5% → breach
    const result = evaluateInstanceHealth(stats, makeConfig({ minSampleSize: 20, invalidRatePct: 5 }), NOW_MS);
    expect(result.some(b => b.type === 'signature_spike')).toBe(true);
  });

  it('breach has correct instance', () => {
    const stats = makeStats({ instance: 'my-instance', total: 100, invalid: 20 });
    const [breach] = evaluateInstanceHealth(stats, makeConfig({ invalidRatePct: 5 }), NOW_MS);
    expect(breach.instance).toBe('my-instance');
  });

  it('breach value is the rounded rate (one decimal)', () => {
    // 3 invalid / 30 total = 10.0%
    const stats = makeStats({ total: 30, invalid: 3 });
    const [breach] = evaluateInstanceHealth(stats, makeConfig({ invalidRatePct: 5 }), NOW_MS);
    expect(breach.value).toBe(10.0);
  });

  it('reason string contains observed and threshold values', () => {
    const stats = makeStats({ total: 100, invalid: 10 });
    const [breach] = evaluateInstanceHealth(stats, makeConfig({ invalidRatePct: 5 }), NOW_MS);
    expect(breach.reason).toContain('10');
    expect(breach.reason).toContain('5');
  });
});

// ── evaluateInstanceHealth — webhook_silence ──────────────────────────────────

describe('evaluateInstanceHealth — webhook_silence', () => {
  it('returns no silence breach when lastEventAt is recent', () => {
    // lastEventAt = 1 min ago, silenceMinutes = 10 → no breach
    const stats = makeStats({
      total24h: 100,
      lastEventAt: new Date(NOW_MS - 60_000).toISOString(),
    });
    const result = evaluateInstanceHealth(stats, makeConfig({ silenceMinutes: 10 }), NOW_MS);
    const silence = result.filter(b => b.type === 'webhook_silence');
    expect(silence).toHaveLength(0);
  });

  it('returns silence breach when silent >= silenceMinutes', () => {
    // lastEventAt = 15 min ago, silenceMinutes = 10 → breach
    const stats = makeStats({
      total24h: 100,
      lastEventAt: new Date(NOW_MS - 15 * 60_000).toISOString(),
    });
    const result = evaluateInstanceHealth(stats, makeConfig({ silenceMinutes: 10 }), NOW_MS);
    const silence = result.filter(b => b.type === 'webhook_silence');
    expect(silence).toHaveLength(1);
  });

  it('no silence breach when total24h=0 (dormant instance)', () => {
    const stats = makeStats({
      total24h: 0,
      lastEventAt: new Date(NOW_MS - 60 * 60_000).toISOString(),
    });
    const result = evaluateInstanceHealth(stats, makeConfig({ silenceMinutes: 10 }), NOW_MS);
    const silence = result.filter(b => b.type === 'webhook_silence');
    expect(silence).toHaveLength(0);
  });

  it('no silence breach when lastEventAt is null', () => {
    const stats = makeStats({ total24h: 100, lastEventAt: null });
    const result = evaluateInstanceHealth(stats, makeConfig(), NOW_MS);
    const silence = result.filter(b => b.type === 'webhook_silence');
    expect(silence).toHaveLength(0);
  });

  it('silence breach value is elapsed minutes (rounded)', () => {
    // 15 min silent
    const stats = makeStats({
      total24h: 100,
      lastEventAt: new Date(NOW_MS - 15 * 60_000).toISOString(),
    });
    const [breach] = evaluateInstanceHealth(stats, makeConfig({ silenceMinutes: 10 }), NOW_MS)
      .filter(b => b.type === 'webhook_silence');
    expect(breach.value).toBe(15);
  });
});

// ── evaluateInstanceHealth — both breaches ────────────────────────────────────

describe('evaluateInstanceHealth — both breaches simultaneously', () => {
  it('can return both signature_spike and webhook_silence', () => {
    const stats = makeStats({
      total: 100,
      invalid: 20,
      total24h: 100,
      lastEventAt: new Date(NOW_MS - 30 * 60_000).toISOString(),
    });
    const result = evaluateInstanceHealth(stats, makeConfig({ invalidRatePct: 5, silenceMinutes: 10 }), NOW_MS);
    const types = result.map(b => b.type);
    expect(types).toContain('signature_spike');
    expect(types).toContain('webhook_silence');
  });
});

// ── evaluateAllInstances ──────────────────────────────────────────────────────

describe('evaluateAllInstances', () => {
  it('returns [] for empty list', () => {
    expect(evaluateAllInstances([], makeConfig(), NOW_MS)).toHaveLength(0);
  });

  it('returns [] when no instances have breaches', () => {
    const list = [
      makeStats({ instance: 'a', total: 5, invalid: 0 }),
      makeStats({ instance: 'b', total: 5, invalid: 0 }),
    ];
    expect(evaluateAllInstances(list, makeConfig(), NOW_MS)).toHaveLength(0);
  });

  it('returns breaches from all violating instances', () => {
    const list = [
      makeStats({ instance: 'ok', total: 100, invalid: 1, total24h: 100 }),
      makeStats({ instance: 'bad', total: 100, invalid: 20, total24h: 100 }),
    ];
    const result = evaluateAllInstances(list, makeConfig({ invalidRatePct: 5 }), NOW_MS);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(b => b.instance === 'bad')).toBe(true);
  });

  it('flattens multiple breaches from a single instance', () => {
    const list = [
      makeStats({
        total: 100, invalid: 20,
        total24h: 100,
        lastEventAt: new Date(NOW_MS - 30 * 60_000).toISOString(),
      }),
    ];
    const result = evaluateAllInstances(list, makeConfig({ invalidRatePct: 5, silenceMinutes: 10 }), NOW_MS);
    expect(result).toHaveLength(2);
  });
});

// ── shouldFireAlert ───────────────────────────────────────────────────────────

describe('shouldFireAlert — first call', () => {
  it('returns true when key has never fired', () => {
    const map = new Map<string, number>();
    expect(shouldFireAlert('k', 1000, map, 5000)).toBe(true);
  });

  it('sets nowMs in the map after first fire', () => {
    const map = new Map<string, number>();
    shouldFireAlert('k', 1000, map, 9000);
    expect(map.get('k')).toBe(9000);
  });
});

describe('shouldFireAlert — cooldown', () => {
  it('returns false when within cooldown window', () => {
    const map = new Map<string, number>([['k', 0]]);
    expect(shouldFireAlert('k', 2000, map, 999)).toBe(false);
  });

  it('returns true when cooldown has elapsed', () => {
    const map = new Map<string, number>([['k', 0]]);
    expect(shouldFireAlert('k', 1000, map, 1000)).toBe(true);
  });

  it('does not update map when returning false', () => {
    const map = new Map<string, number>([['k', 5000]]);
    shouldFireAlert('k', 10_000, map, 6000);
    expect(map.get('k')).toBe(5000);
  });

  it('updates map timestamp when firing after cooldown', () => {
    const map = new Map<string, number>([['k', 0]]);
    shouldFireAlert('k', 1000, map, 9000);
    expect(map.get('k')).toBe(9000);
  });
});

describe('shouldFireAlert — key isolation', () => {
  it('different keys are tracked independently', () => {
    const map = new Map<string, number>([['a', 9000]]);
    expect(shouldFireAlert('a', 5000, map, 10_000)).toBe(false);
    expect(shouldFireAlert('b', 5000, map, 10_000)).toBe(true);
  });
});
