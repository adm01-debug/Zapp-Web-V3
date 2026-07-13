import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifySeverity,
  recordQueryEvent,
  recordRetryOutcome,
  getTelemetrySnapshot,
  resetTelemetry,
  TELEMETRY_THRESHOLDS,
} from '@/lib/clientTelemetry';
import type { QueryEvent } from '@/lib/clientTelemetry';

beforeEach(() => {
  resetTelemetry();
});

// ── TELEMETRY_THRESHOLDS constants ────────────────────────────────────────────

describe('TELEMETRY_THRESHOLDS', () => {
  it('SLOW_MS is 1500', () => {
    expect(TELEMETRY_THRESHOLDS.SLOW_MS).toBe(1500);
  });

  it('VERY_SLOW_MS is 4000', () => {
    expect(TELEMETRY_THRESHOLDS.VERY_SLOW_MS).toBe(4000);
  });
});

// ── classifySeverity ─────────────────────────────────────────────────────────

describe('classifySeverity — ok path', () => {
  it('returns "ok" for fast query with no error', () => {
    expect(classifySeverity(100, false, false)).toBe('ok');
  });

  it('returns "ok" at exactly 0 ms', () => {
    expect(classifySeverity(0, false, false)).toBe('ok');
  });

  it('returns "ok" at 1499 ms (just under SLOW_MS)', () => {
    expect(classifySeverity(1499, false, false)).toBe('ok');
  });
});

describe('classifySeverity — slow path', () => {
  it('returns "slow" at exactly SLOW_MS (1500 ms)', () => {
    expect(classifySeverity(1500, false, false)).toBe('slow');
  });

  it('returns "slow" between SLOW_MS and VERY_SLOW_MS', () => {
    expect(classifySeverity(2000, false, false)).toBe('slow');
  });

  it('returns "slow" at 3999 ms (just under VERY_SLOW_MS)', () => {
    expect(classifySeverity(3999, false, false)).toBe('slow');
  });
});

describe('classifySeverity — very_slow path', () => {
  it('returns "very_slow" at exactly VERY_SLOW_MS (4000 ms)', () => {
    expect(classifySeverity(4000, false, false)).toBe('very_slow');
  });

  it('returns "very_slow" above 4000 ms', () => {
    expect(classifySeverity(10_000, false, false)).toBe('very_slow');
  });
});

describe('classifySeverity — error path', () => {
  it('returns "error" when hasError is true regardless of duration', () => {
    expect(classifySeverity(100, true, false)).toBe('error');
  });

  it('returns "error" for slow queries that also errored', () => {
    expect(classifySeverity(5000, true, false)).toBe('error');
  });
});

describe('classifySeverity — timeout path', () => {
  it('returns "timeout" when isTimeout is true', () => {
    expect(classifySeverity(100, false, true)).toBe('timeout');
  });

  it('timeout takes priority over error', () => {
    expect(classifySeverity(100, true, true)).toBe('timeout');
  });

  it('timeout takes priority over very_slow', () => {
    expect(classifySeverity(8000, false, true)).toBe('timeout');
  });
});

// ── resetTelemetry ────────────────────────────────────────────────────────────

describe('resetTelemetry', () => {
  it('resets total to 0', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    resetTelemetry();
    expect(getTelemetrySnapshot().total).toBe(0);
  });

  it('resets all severity counters to 0', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    resetTelemetry();
    const snap = getTelemetrySnapshot();
    expect(snap.bySeverity.ok).toBe(0);
    expect(snap.bySeverity.slow).toBe(0);
    expect(snap.bySeverity.error).toBe(0);
  });

  it('resets recentEvents to empty array', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    resetTelemetry();
    expect(getTelemetrySnapshot().recentEvents).toHaveLength(0);
  });

  it('resets avgDurationMs to 0', () => {
    recordQueryEvent(makeEvent({ durationMs: 9000 }));
    resetTelemetry();
    expect(getTelemetrySnapshot().avgDurationMs).toBe(0);
  });

  it('resets retry stats', () => {
    recordRetryOutcome({ target: 'foo', attempts: 3, recovered: true, exhausted: false, transientCount: 2 });
    resetTelemetry();
    const snap = getTelemetrySnapshot();
    expect(snap.retry.totalRetries).toBe(0);
    expect(snap.retry.recoveredAfterRetry).toBe(0);
    expect(snap.retry.transientByTarget).toEqual({});
  });
});

// ── recordQueryEvent ──────────────────────────────────────────────────────────

describe('recordQueryEvent — basic recording', () => {
  it('increments total on each call', () => {
    recordQueryEvent(makeEvent());
    recordQueryEvent(makeEvent());
    expect(getTelemetrySnapshot().total).toBe(2);
  });

  it('returns the full event with computed severity', () => {
    const ev = recordQueryEvent(makeEvent({ durationMs: 100 }));
    expect(ev.severity).toBe('ok');
  });

  it('uses caller-provided severity when supplied', () => {
    const ev = recordQueryEvent(makeEvent({ durationMs: 100, severity: 'error' }));
    expect(ev.severity).toBe('error');
  });

  it('infers severity from durationMs when severity is omitted', () => {
    const ev = recordQueryEvent(makeEvent({ durationMs: 2000 }));
    expect(ev.severity).toBe('slow');
  });

  it('adds event to recentEvents', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    expect(getTelemetrySnapshot().recentEvents).toHaveLength(1);
  });

  it('does NOT add ok events to slowEvents', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    expect(getTelemetrySnapshot().slowEvents).toHaveLength(0);
  });

  it('adds slow events to slowEvents', () => {
    recordQueryEvent(makeEvent({ durationMs: 2000 }));
    expect(getTelemetrySnapshot().slowEvents).toHaveLength(1);
  });

  it('adds error events to slowEvents', () => {
    recordQueryEvent(makeEvent({ errorMessage: 'oops' }));
    expect(getTelemetrySnapshot().slowEvents).toHaveLength(1);
  });
});

describe('recordQueryEvent — bySeverity counters', () => {
  it('increments ok counter', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    expect(getTelemetrySnapshot().bySeverity.ok).toBe(1);
  });

  it('increments slow counter', () => {
    recordQueryEvent(makeEvent({ durationMs: 1500 }));
    expect(getTelemetrySnapshot().bySeverity.slow).toBe(1);
  });

  it('increments very_slow counter', () => {
    recordQueryEvent(makeEvent({ durationMs: 5000 }));
    expect(getTelemetrySnapshot().bySeverity.very_slow).toBe(1);
  });

  it('increments error counter when errorMessage is present', () => {
    recordQueryEvent(makeEvent({ errorMessage: 'failed' }));
    expect(getTelemetrySnapshot().bySeverity.error).toBe(1);
  });

  it('increments timeout counter when severity is timeout', () => {
    recordQueryEvent(makeEvent({ severity: 'timeout' }));
    expect(getTelemetrySnapshot().bySeverity.timeout).toBe(1);
  });
});

describe('recordQueryEvent — bySource counters', () => {
  it('counts events per source', () => {
    recordQueryEvent(makeEvent({ source: 'externalProxy' }));
    recordQueryEvent(makeEvent({ source: 'externalProxy' }));
    recordQueryEvent(makeEvent({ source: 'externalSupabase' }));
    const snap = getTelemetrySnapshot();
    expect(snap.bySource['externalProxy']).toBe(2);
    expect(snap.bySource['externalSupabase']).toBe(1);
  });
});

describe('recordQueryEvent — avgDurationMs', () => {
  it('computes average correctly after several events', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    recordQueryEvent(makeEvent({ durationMs: 300 }));
    expect(getTelemetrySnapshot().avgDurationMs).toBe(200);
  });

  it('rounds average to nearest integer', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    recordQueryEvent(makeEvent({ durationMs: 200 }));
    recordQueryEvent(makeEvent({ durationMs: 300 }));
    // (100+200+300)/3 = 200 exactly
    expect(getTelemetrySnapshot().avgDurationMs).toBe(200);
  });
});

describe('recordQueryEvent — recentEvents ring buffer', () => {
  it('caps recentEvents at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      recordQueryEvent(makeEvent({ durationMs: i }));
    }
    expect(getTelemetrySnapshot().recentEvents).toHaveLength(50);
  });

  it('keeps most recent events when buffer overflows', () => {
    for (let i = 0; i < 60; i++) {
      recordQueryEvent(makeEvent({ durationMs: i }));
    }
    const snap = getTelemetrySnapshot();
    // First event has durationMs=0 and was shifted out; last has durationMs=59
    expect(snap.recentEvents[snap.recentEvents.length - 1].durationMs).toBe(59);
  });
});

describe('recordQueryEvent — slowEvents ring buffer', () => {
  it('caps slowEvents at 20 entries', () => {
    for (let i = 0; i < 25; i++) {
      recordQueryEvent(makeEvent({ durationMs: 5000 }));
    }
    expect(getTelemetrySnapshot().slowEvents).toHaveLength(20);
  });
});

// ── getTelemetrySnapshot — p95 ────────────────────────────────────────────────

describe('getTelemetrySnapshot — p95DurationMs', () => {
  it('returns 0 when no events recorded', () => {
    expect(getTelemetrySnapshot().p95DurationMs).toBe(0);
  });

  it('returns the max value for a small set (p95 of 1 element is that element)', () => {
    recordQueryEvent(makeEvent({ durationMs: 500 }));
    expect(getTelemetrySnapshot().p95DurationMs).toBe(500);
  });

  it('p95 of sorted values selects correct index', () => {
    // 20 events: 100, 200, ..., 2000
    // sorted: [100, 200, ..., 2000]
    // idx = floor(20 * 0.95) = floor(19) = 19 → value=2000
    for (let i = 1; i <= 20; i++) {
      recordQueryEvent(makeEvent({ durationMs: i * 100 }));
    }
    expect(getTelemetrySnapshot().p95DurationMs).toBe(2000);
  });
});

// ── recordRetryOutcome ────────────────────────────────────────────────────────

describe('recordRetryOutcome — basic tracking', () => {
  it('accumulates totalRetries from attempts-1', () => {
    recordRetryOutcome({ target: 'a', attempts: 3, recovered: false, exhausted: false, transientCount: 0 });
    // 3 attempts → 2 extra retries
    expect(getTelemetrySnapshot().retry.totalRetries).toBe(2);
  });

  it('single attempt results in 0 totalRetries', () => {
    recordRetryOutcome({ target: 'a', attempts: 1, recovered: false, exhausted: false, transientCount: 0 });
    expect(getTelemetrySnapshot().retry.totalRetries).toBe(0);
  });

  it('increments recoveredAfterRetry when recovered=true', () => {
    recordRetryOutcome({ target: 'a', attempts: 2, recovered: true, exhausted: false, transientCount: 0 });
    expect(getTelemetrySnapshot().retry.recoveredAfterRetry).toBe(1);
  });

  it('does not increment recoveredAfterRetry when recovered=false', () => {
    recordRetryOutcome({ target: 'a', attempts: 2, recovered: false, exhausted: false, transientCount: 0 });
    expect(getTelemetrySnapshot().retry.recoveredAfterRetry).toBe(0);
  });

  it('increments exhausted when exhausted=true', () => {
    recordRetryOutcome({ target: 'a', attempts: 3, recovered: false, exhausted: true, transientCount: 0 });
    expect(getTelemetrySnapshot().retry.exhausted).toBe(1);
  });

  it('tracks transientByTarget when transientCount > 0', () => {
    recordRetryOutcome({ target: 'contacts', attempts: 2, recovered: true, exhausted: false, transientCount: 1 });
    expect(getTelemetrySnapshot().retry.transientByTarget['contacts']).toBe(1);
  });

  it('accumulates transientByTarget across calls for same target', () => {
    recordRetryOutcome({ target: 'messages', attempts: 2, recovered: true, exhausted: false, transientCount: 2 });
    recordRetryOutcome({ target: 'messages', attempts: 3, recovered: true, exhausted: false, transientCount: 1 });
    expect(getTelemetrySnapshot().retry.transientByTarget['messages']).toBe(3);
  });

  it('does not add to transientByTarget when transientCount is 0', () => {
    recordRetryOutcome({ target: 'a', attempts: 2, recovered: true, exhausted: false, transientCount: 0 });
    expect(getTelemetrySnapshot().retry.transientByTarget['a']).toBeUndefined();
  });

  it('accumulates totalRetries across multiple calls', () => {
    recordRetryOutcome({ target: 'a', attempts: 3, recovered: false, exhausted: false, transientCount: 0 });
    recordRetryOutcome({ target: 'b', attempts: 2, recovered: false, exhausted: false, transientCount: 0 });
    // 2 + 1 = 3
    expect(getTelemetrySnapshot().retry.totalRetries).toBe(3);
  });
});

// ── snapshot isolation ────────────────────────────────────────────────────────

describe('getTelemetrySnapshot — returns copies, not references', () => {
  it('bySeverity is a new object on each call', () => {
    const s1 = getTelemetrySnapshot();
    const s2 = getTelemetrySnapshot();
    expect(s1.bySeverity).not.toBe(s2.bySeverity);
  });

  it('recentEvents is a new array on each call', () => {
    const s1 = getTelemetrySnapshot();
    const s2 = getTelemetrySnapshot();
    expect(s1.recentEvents).not.toBe(s2.recentEvents);
  });

  it('mutating snapshot does not affect internal state', () => {
    recordQueryEvent(makeEvent({ durationMs: 100 }));
    const snap = getTelemetrySnapshot();
    snap.recentEvents.splice(0, 1);
    // Internal state unchanged
    expect(getTelemetrySnapshot().recentEvents).toHaveLength(1);
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  overrides: Partial<Omit<QueryEvent, 'severity'> & { severity?: QueryEvent['severity'] }> = {},
): Omit<QueryEvent, 'severity'> & { severity?: QueryEvent['severity'] } {
  return {
    operation: 'select',
    source: 'externalProxy',
    target: 'messages',
    durationMs: 100,
    limit: null,
    offset: null,
    filters: null,
    recordCount: null,
    startedAt: 0,
    ...overrides,
  };
}
