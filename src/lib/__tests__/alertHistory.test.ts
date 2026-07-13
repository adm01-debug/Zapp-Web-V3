import { describe, it, expect } from 'vitest';
import {
  classifySeverity,
  buildHistoryEntry,
} from '@/lib/alertHistory';
import type {
  AlertSeverity,
} from '@/lib/alertHistory';
import type {
  WebhookAlertBreach,
  WebhookAlertConfig,
} from '@/lib/webhookHealthAlerts';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeBreach(overrides: Partial<WebhookAlertBreach> = {}): WebhookAlertBreach {
  return {
    type: 'signature_spike',
    instance: 'whatsapp-main',
    reason: 'too many invalid sigs',
    value: 10,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<WebhookAlertConfig> = {}): WebhookAlertConfig {
  return {
    invalidRatePct: 5,
    minSampleSize: 20,
    silenceMinutes: 10,
    enabled: true,
    ...overrides,
  };
}

// ── classifySeverity — signature_spike ────────────────────────────────────────

describe('classifySeverity — signature_spike', () => {
  it('returns "critical" when ratio >= 3x threshold', () => {
    // value=15, threshold=5 → ratio=3 → critical
    const breach = makeBreach({ type: 'signature_spike', value: 15 });
    expect(classifySeverity(breach, makeConfig({ invalidRatePct: 5 }))).toBe<AlertSeverity>('critical');
  });

  it('returns "critical" for ratio well above 3x', () => {
    const breach = makeBreach({ type: 'signature_spike', value: 50 });
    expect(classifySeverity(breach, makeConfig({ invalidRatePct: 5 }))).toBe('critical');
  });

  it('returns "high" when ratio >= 1.5x but < 3x', () => {
    // value=10, threshold=5 → ratio=2 → high
    const breach = makeBreach({ type: 'signature_spike', value: 10 });
    expect(classifySeverity(breach, makeConfig({ invalidRatePct: 5 }))).toBe<AlertSeverity>('high');
  });

  it('returns "high" at exactly 1.5x threshold', () => {
    // value=7.5, threshold=5 → ratio=1.5 → high
    const breach = makeBreach({ type: 'signature_spike', value: 7.5 });
    expect(classifySeverity(breach, makeConfig({ invalidRatePct: 5 }))).toBe('high');
  });

  it('returns "medium" when ratio < 1.5x', () => {
    // value=6, threshold=5 → ratio=1.2 → medium
    const breach = makeBreach({ type: 'signature_spike', value: 6 });
    expect(classifySeverity(breach, makeConfig({ invalidRatePct: 5 }))).toBe<AlertSeverity>('medium');
  });

  it('returns "medium" when value just exceeds threshold', () => {
    // value=5.1, threshold=5 → ratio=1.02 → medium
    const breach = makeBreach({ type: 'signature_spike', value: 5.1 });
    expect(classifySeverity(breach, makeConfig({ invalidRatePct: 5 }))).toBe('medium');
  });

  it('returns "medium" when threshold is 0 (ratio defaults to 1)', () => {
    const breach = makeBreach({ type: 'signature_spike', value: 50 });
    expect(classifySeverity(breach, makeConfig({ invalidRatePct: 0 }))).toBe('medium');
  });
});

// ── classifySeverity — webhook_silence ────────────────────────────────────────

describe('classifySeverity — webhook_silence', () => {
  it('returns "critical" when silent time is >= 3x threshold', () => {
    // value=30 min, threshold=10 min → ratio=3 → critical
    const breach = makeBreach({ type: 'webhook_silence', value: 30 });
    expect(classifySeverity(breach, makeConfig({ silenceMinutes: 10 }))).toBe('critical');
  });

  it('returns "high" when ratio is between 1.5x and 3x', () => {
    // value=20 min, threshold=10 min → ratio=2 → high
    const breach = makeBreach({ type: 'webhook_silence', value: 20 });
    expect(classifySeverity(breach, makeConfig({ silenceMinutes: 10 }))).toBe('high');
  });

  it('returns "medium" when ratio < 1.5x', () => {
    // value=12 min, threshold=10 min → ratio=1.2 → medium
    const breach = makeBreach({ type: 'webhook_silence', value: 12 });
    expect(classifySeverity(breach, makeConfig({ silenceMinutes: 10 }))).toBe('medium');
  });

  it('returns "medium" when silenceMinutes is 0 (ratio defaults to 1)', () => {
    const breach = makeBreach({ type: 'webhook_silence', value: 100 });
    expect(classifySeverity(breach, makeConfig({ silenceMinutes: 0 }))).toBe('medium');
  });
});

// ── buildHistoryEntry ──────────────────────────────────────────────────────────

describe('buildHistoryEntry — signature_spike', () => {
  const FIRED_AT = 1_700_000_000_000;

  it('returns an entry with firedAt = provided timestamp', () => {
    const entry = buildHistoryEntry(makeBreach(), makeConfig(), FIRED_AT);
    expect(entry.firedAt).toBe(FIRED_AT);
  });

  it('entry instance matches breach instance', () => {
    const entry = buildHistoryEntry(
      makeBreach({ instance: 'test-instance' }),
      makeConfig(),
      FIRED_AT,
    );
    expect(entry.instance).toBe('test-instance');
  });

  it('entry type matches breach type', () => {
    const entry = buildHistoryEntry(makeBreach({ type: 'signature_spike' }), makeConfig(), FIRED_AT);
    expect(entry.type).toBe('signature_spike');
  });

  it('entry reason matches breach reason', () => {
    const breach = makeBreach({ reason: 'custom reason' });
    const entry = buildHistoryEntry(breach, makeConfig(), FIRED_AT);
    expect(entry.reason).toBe('custom reason');
  });

  it('entry observed matches breach value', () => {
    const entry = buildHistoryEntry(makeBreach({ value: 42 }), makeConfig(), FIRED_AT);
    expect(entry.observed).toBe(42);
  });

  it('threshold uses invalidRatePct for signature_spike', () => {
    const entry = buildHistoryEntry(
      makeBreach({ type: 'signature_spike' }),
      makeConfig({ invalidRatePct: 7 }),
      FIRED_AT,
    );
    expect(entry.threshold).toBe(7);
  });

  it('id is deterministic: instance|type|firedAt', () => {
    const entry = buildHistoryEntry(
      makeBreach({ instance: 'inst', type: 'signature_spike' }),
      makeConfig(),
      1000,
    );
    expect(entry.id).toBe('inst|signature_spike|1000');
  });

  it('severity is set based on ratio', () => {
    // value=15, threshold=5 → ratio=3 → critical
    const entry = buildHistoryEntry(
      makeBreach({ value: 15 }),
      makeConfig({ invalidRatePct: 5 }),
      FIRED_AT,
    );
    expect(entry.severity).toBe('critical');
  });
});

describe('buildHistoryEntry — webhook_silence', () => {
  const FIRED_AT = 9_000_000;

  it('threshold uses silenceMinutes for webhook_silence', () => {
    const entry = buildHistoryEntry(
      makeBreach({ type: 'webhook_silence' }),
      makeConfig({ silenceMinutes: 15 }),
      FIRED_AT,
    );
    expect(entry.threshold).toBe(15);
  });

  it('id encodes type as webhook_silence', () => {
    const entry = buildHistoryEntry(
      makeBreach({ instance: 'inst', type: 'webhook_silence' }),
      makeConfig(),
      500,
    );
    expect(entry.id).toBe('inst|webhook_silence|500');
  });

  it('entry type is webhook_silence', () => {
    const entry = buildHistoryEntry(
      makeBreach({ type: 'webhook_silence' }),
      makeConfig(),
      FIRED_AT,
    );
    expect(entry.type).toBe('webhook_silence');
  });
});

describe('buildHistoryEntry — default firedAt', () => {
  it('sets firedAt close to Date.now() when not provided', () => {
    const before = Date.now();
    const entry = buildHistoryEntry(makeBreach(), makeConfig());
    const after = Date.now();
    expect(entry.firedAt).toBeGreaterThanOrEqual(before);
    expect(entry.firedAt).toBeLessThanOrEqual(after);
  });
});
