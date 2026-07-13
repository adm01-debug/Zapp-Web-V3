import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger so info/warn calls are silent in tests.
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  recordLoadOlderStarted,
  recordLoadOlderCancelled,
  recordLoadOlderCompleted,
  getLoadOlderMetrics,
  resetLoadOlderMetrics,
} from '../loadOlderMetrics';

// Reset module-level state between every test to ensure isolation.
beforeEach(() => {
  resetLoadOlderMetrics();
});

// ── initial state ─────────────────────────────────────────────────────────────

describe('initial state (after reset)', () => {
  it('started is 0', () => {
    expect(getLoadOlderMetrics().started).toBe(0);
  });

  it('cancelled is 0', () => {
    expect(getLoadOlderMetrics().cancelled).toBe(0);
  });

  it('completed is 0', () => {
    expect(getLoadOlderMetrics().completed).toBe(0);
  });

  it('completionRate is 0 when started is 0', () => {
    expect(getLoadOlderMetrics().completionRate).toBe(0);
  });

  it('avgDurationMs is 0 when no completions', () => {
    expect(getLoadOlderMetrics().avgDurationMs).toBe(0);
  });

  it('recentDurationsMs is empty array', () => {
    expect(getLoadOlderMetrics().recentDurationsMs).toEqual([]);
  });
});

// ── recordLoadOlderStarted ────────────────────────────────────────────────────

describe('recordLoadOlderStarted', () => {
  it('increments started counter', () => {
    recordLoadOlderStarted();
    expect(getLoadOlderMetrics().started).toBe(1);
  });

  it('increments started counter on each call', () => {
    recordLoadOlderStarted();
    recordLoadOlderStarted();
    expect(getLoadOlderMetrics().started).toBe(2);
  });

  it('returns a number (startedAt timestamp)', () => {
    const ts = recordLoadOlderStarted();
    expect(typeof ts).toBe('number');
  });

  it('does not affect cancelled counter', () => {
    recordLoadOlderStarted();
    expect(getLoadOlderMetrics().cancelled).toBe(0);
  });

  it('does not affect completed counter', () => {
    recordLoadOlderStarted();
    expect(getLoadOlderMetrics().completed).toBe(0);
  });
});

// ── recordLoadOlderCancelled ──────────────────────────────────────────────────

describe('recordLoadOlderCancelled', () => {
  it('increments cancelled counter', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCancelled(ts);
    expect(getLoadOlderMetrics().cancelled).toBe(1);
  });

  it('increments cancelled on multiple calls', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderStarted();
    recordLoadOlderCancelled(ts);
    recordLoadOlderCancelled(ts);
    expect(getLoadOlderMetrics().cancelled).toBe(2);
  });

  it('accepts null for startedAt (no elapsed time)', () => {
    expect(() => recordLoadOlderCancelled(null)).not.toThrow();
    expect(getLoadOlderMetrics().cancelled).toBe(1);
  });

  it('does not affect completed counter', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCancelled(ts);
    expect(getLoadOlderMetrics().completed).toBe(0);
  });
});

// ── recordLoadOlderCompleted ──────────────────────────────────────────────────

describe('recordLoadOlderCompleted', () => {
  it('increments completed counter', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    expect(getLoadOlderMetrics().completed).toBe(1);
  });

  it('increments completed on each call', () => {
    const ts1 = recordLoadOlderStarted();
    const ts2 = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts1);
    recordLoadOlderCompleted(ts2);
    expect(getLoadOlderMetrics().completed).toBe(2);
  });

  it('adds a duration entry to recentDurationsMs', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    expect(getLoadOlderMetrics().recentDurationsMs).toHaveLength(1);
  });

  it('duration in recentDurationsMs is a non-negative number', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    const [dur] = getLoadOlderMetrics().recentDurationsMs;
    expect(dur).toBeGreaterThanOrEqual(0);
  });

  it('does not affect cancelled counter', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    expect(getLoadOlderMetrics().cancelled).toBe(0);
  });
});

// ── completionRate ────────────────────────────────────────────────────────────

describe('completionRate', () => {
  it('is 1.0 when all started loads completed', () => {
    const ts1 = recordLoadOlderStarted();
    const ts2 = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts1);
    recordLoadOlderCompleted(ts2);
    expect(getLoadOlderMetrics().completionRate).toBe(1);
  });

  it('is 0.5 when half completed, half cancelled', () => {
    const ts1 = recordLoadOlderStarted();
    const ts2 = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts1);
    recordLoadOlderCancelled(ts2);
    expect(getLoadOlderMetrics().completionRate).toBe(0.5);
  });

  it('is 0 when all started loads were cancelled', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCancelled(ts);
    expect(getLoadOlderMetrics().completionRate).toBe(0);
  });
});

// ── avgDurationMs ─────────────────────────────────────────────────────────────

describe('avgDurationMs', () => {
  it('remains 0 when no completions', () => {
    recordLoadOlderStarted();
    expect(getLoadOlderMetrics().avgDurationMs).toBe(0);
  });

  it('equals the single duration when only one completion', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    const snap = getLoadOlderMetrics();
    expect(snap.avgDurationMs).toBe(snap.recentDurationsMs[0]);
  });

  it('equals the average of all completion durations', () => {
    const ts1 = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts1);
    const ts2 = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts2);
    const snap = getLoadOlderMetrics();
    const expected = snap.recentDurationsMs.reduce((a, b) => a + b, 0) / snap.recentDurationsMs.length;
    expect(snap.avgDurationMs).toBeCloseTo(expected, 5);
  });
});

// ── RECENT_LIMIT rolling window (20 entries) ──────────────────────────────────

describe('recentDurationsMs rolling window', () => {
  it('caps at 20 entries when more than 20 completions occur', () => {
    for (let i = 0; i < 25; i++) {
      const ts = recordLoadOlderStarted();
      recordLoadOlderCompleted(ts);
    }
    expect(getLoadOlderMetrics().recentDurationsMs.length).toBe(20);
  });

  it('retains the last 20 durations (oldest is shifted out)', () => {
    for (let i = 0; i < 22; i++) {
      const ts = recordLoadOlderStarted();
      recordLoadOlderCompleted(ts);
    }
    // 25 completions but only 20 kept
    expect(getLoadOlderMetrics().recentDurationsMs).toHaveLength(20);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('resetLoadOlderMetrics', () => {
  it('clears started counter', () => {
    recordLoadOlderStarted();
    resetLoadOlderMetrics();
    expect(getLoadOlderMetrics().started).toBe(0);
  });

  it('clears cancelled counter', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCancelled(ts);
    resetLoadOlderMetrics();
    expect(getLoadOlderMetrics().cancelled).toBe(0);
  });

  it('clears completed counter', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    resetLoadOlderMetrics();
    expect(getLoadOlderMetrics().completed).toBe(0);
  });

  it('clears recentDurationsMs', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    resetLoadOlderMetrics();
    expect(getLoadOlderMetrics().recentDurationsMs).toEqual([]);
  });

  it('resets completionRate to 0', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    resetLoadOlderMetrics();
    expect(getLoadOlderMetrics().completionRate).toBe(0);
  });

  it('allows fresh accumulation after reset', () => {
    const ts1 = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts1);
    resetLoadOlderMetrics();
    const ts2 = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts2);
    expect(getLoadOlderMetrics().started).toBe(1);
    expect(getLoadOlderMetrics().completed).toBe(1);
  });
});

// ── getLoadOlderMetrics snapshot immutability ─────────────────────────────────

describe('getLoadOlderMetrics snapshot', () => {
  it('returns a copy of recentDurationsMs (mutation does not affect state)', () => {
    const ts = recordLoadOlderStarted();
    recordLoadOlderCompleted(ts);
    const snap = getLoadOlderMetrics();
    snap.recentDurationsMs.push(9999);
    expect(getLoadOlderMetrics().recentDurationsMs).not.toContain(9999);
  });
});
