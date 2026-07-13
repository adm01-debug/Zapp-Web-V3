import { describe, it, expect } from 'vitest';
import {
  simulateRetrySchedule,
  formatScheduleMs,
} from '@/lib/retryScheduleSimulation';
import type { RetryConfig } from '@/lib/retryConfig';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<RetryConfig> = {}): RetryConfig {
  return {
    maxRetries: 3,
    baseBackoffMs: 1000,
    maxBackoffMs: 30_000,
    timeoutMs: 10_000,
    ...overrides,
  };
}

// ── simulateRetrySchedule — basic structure ───────────────────────────────────

describe('simulateRetrySchedule — structure', () => {
  it('returns attempts array of length maxRetries + 1', () => {
    const schedule = simulateRetrySchedule(makeConfig({ maxRetries: 3 }));
    expect(schedule.attempts).toHaveLength(4);
  });

  it('first attempt has delayBeforeMs of 0', () => {
    const schedule = simulateRetrySchedule(makeConfig());
    expect(schedule.attempts[0].delayBeforeMs).toBe(0);
  });

  it('first attempt has startAtMs of 0', () => {
    const schedule = simulateRetrySchedule(makeConfig());
    expect(schedule.attempts[0].startAtMs).toBe(0);
  });

  it('first attempt has attempt number 1', () => {
    const schedule = simulateRetrySchedule(makeConfig());
    expect(schedule.attempts[0].attempt).toBe(1);
  });

  it('attempt numbers are sequential starting at 1', () => {
    const schedule = simulateRetrySchedule(makeConfig({ maxRetries: 2 }));
    expect(schedule.attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
  });

  it('only the last attempt has isFinal=true', () => {
    const schedule = simulateRetrySchedule(makeConfig({ maxRetries: 3 }));
    const finalFlags = schedule.attempts.map((a) => a.isFinal);
    expect(finalFlags).toEqual([false, false, false, true]);
  });

  it('abortAtMs = startAtMs + timeoutMs for every attempt', () => {
    const timeout = 5000;
    const schedule = simulateRetrySchedule(makeConfig({ timeoutMs: timeout }));
    for (const a of schedule.attempts) {
      expect(a.abortAtMs).toBe(a.startAtMs + timeout);
    }
  });
});

// ── simulateRetrySchedule — delay computation ─────────────────────────────────

describe('simulateRetrySchedule — exponential backoff', () => {
  it('second attempt delay = baseBackoffMs * 2^0 = base', () => {
    const base = 1000;
    const schedule = simulateRetrySchedule(makeConfig({ baseBackoffMs: base, maxBackoffMs: 60_000 }));
    expect(schedule.attempts[1].delayBeforeMs).toBe(base);
  });

  it('third attempt delay = baseBackoffMs * 2^1 = 2 * base', () => {
    const base = 1000;
    const schedule = simulateRetrySchedule(makeConfig({ baseBackoffMs: base, maxBackoffMs: 60_000 }));
    expect(schedule.attempts[2].delayBeforeMs).toBe(2 * base);
  });

  it('fourth attempt delay = baseBackoffMs * 2^2 = 4 * base', () => {
    const base = 1000;
    const schedule = simulateRetrySchedule(makeConfig({ baseBackoffMs: base, maxBackoffMs: 60_000 }));
    expect(schedule.attempts[3].delayBeforeMs).toBe(4 * base);
  });

  it('delay is capped at maxBackoffMs', () => {
    const base = 1000;
    const max = 3000;
    const schedule = simulateRetrySchedule(makeConfig({ baseBackoffMs: base, maxBackoffMs: max, maxRetries: 5 }));
    for (const a of schedule.attempts) {
      expect(a.delayBeforeMs).toBeLessThanOrEqual(max);
    }
  });

  it('delay saturates when exponential exceeds maxBackoffMs', () => {
    // base=1000, max=2000 → delays: 0, 1000, 2000, 2000, 2000 (saturated)
    const base = 1000;
    const max = 2000;
    const schedule = simulateRetrySchedule(makeConfig({ baseBackoffMs: base, maxBackoffMs: max, maxRetries: 4 }));
    expect(schedule.attempts[1].delayBeforeMs).toBe(1000);
    expect(schedule.attempts[2].delayBeforeMs).toBe(2000);
    expect(schedule.attempts[3].delayBeforeMs).toBe(2000);
    expect(schedule.attempts[4].delayBeforeMs).toBe(2000);
  });
});

// ── simulateRetrySchedule — cumulative timing ─────────────────────────────────

describe('simulateRetrySchedule — cumulative timing', () => {
  it('startAtMs of attempt N equals previous abortAtMs + next delay', () => {
    const schedule = simulateRetrySchedule(makeConfig());
    for (let i = 1; i < schedule.attempts.length; i++) {
      const prev = schedule.attempts[i - 1];
      const curr = schedule.attempts[i];
      expect(curr.startAtMs).toBe(prev.abortAtMs + curr.delayBeforeMs);
    }
  });

  it('totalBackoffMs equals sum of all delayBeforeMs', () => {
    const schedule = simulateRetrySchedule(makeConfig());
    const manual = schedule.attempts.reduce((s, a) => s + a.delayBeforeMs, 0);
    expect(schedule.totalBackoffMs).toBe(manual);
  });

  it('worstCaseTotalMs equals last abortAtMs', () => {
    const schedule = simulateRetrySchedule(makeConfig());
    const last = schedule.attempts[schedule.attempts.length - 1];
    expect(schedule.worstCaseTotalMs).toBe(last.abortAtMs);
  });

  it('bestCaseTotalMs equals timeoutMs', () => {
    const timeout = 8000;
    const schedule = simulateRetrySchedule(makeConfig({ timeoutMs: timeout }));
    expect(schedule.bestCaseTotalMs).toBe(timeout);
  });
});

// ── simulateRetrySchedule — edge cases ───────────────────────────────────────

describe('simulateRetrySchedule — edge cases', () => {
  it('maxRetries=0 produces exactly 1 attempt', () => {
    const schedule = simulateRetrySchedule(makeConfig({ maxRetries: 0 }));
    expect(schedule.attempts).toHaveLength(1);
    expect(schedule.attempts[0].isFinal).toBe(true);
    expect(schedule.attempts[0].delayBeforeMs).toBe(0);
  });

  it('maxRetries=0 totalBackoffMs is 0', () => {
    const schedule = simulateRetrySchedule(makeConfig({ maxRetries: 0 }));
    expect(schedule.totalBackoffMs).toBe(0);
  });

  it('maxRetries=1 produces 2 attempts', () => {
    const schedule = simulateRetrySchedule(makeConfig({ maxRetries: 1 }));
    expect(schedule.attempts).toHaveLength(2);
  });

  it('large maxRetries still caps delay at maxBackoffMs', () => {
    const schedule = simulateRetrySchedule(makeConfig({ maxRetries: 20, maxBackoffMs: 5000 }));
    for (const a of schedule.attempts) {
      expect(a.delayBeforeMs).toBeLessThanOrEqual(5000);
    }
  });
});

// ── formatScheduleMs ──────────────────────────────────────────────────────────

describe('formatScheduleMs', () => {
  it('formats 0ms', () => {
    expect(formatScheduleMs(0)).toBe('0ms');
  });

  it('formats 999ms', () => {
    expect(formatScheduleMs(999)).toBe('999ms');
  });

  it('formats exactly 1000ms as 1s (no decimal)', () => {
    expect(formatScheduleMs(1000)).toBe('1s');
  });

  it('formats 1500ms as 1.5s', () => {
    expect(formatScheduleMs(1500)).toBe('1.5s');
  });

  it('formats 2000ms as 2s (no decimal)', () => {
    expect(formatScheduleMs(2000)).toBe('2s');
  });

  it('formats 5500ms as 5.5s', () => {
    expect(formatScheduleMs(5500)).toBe('5.5s');
  });

  it('formats 59999ms as sub-minute seconds', () => {
    const result = formatScheduleMs(59_999);
    expect(result).toMatch(/s$/);
    expect(result).not.toMatch(/m/);
  });

  it('formats 60000ms as 1m', () => {
    expect(formatScheduleMs(60_000)).toBe('1m');
  });

  it('formats 61000ms as 1m1s', () => {
    expect(formatScheduleMs(61_000)).toBe('1m1s');
  });

  it('formats 90000ms as 1m30s', () => {
    expect(formatScheduleMs(90_000)).toBe('1m30s');
  });

  it('formats 120000ms as 2m', () => {
    expect(formatScheduleMs(120_000)).toBe('2m');
  });

  it('formats 125000ms as 2m5s', () => {
    expect(formatScheduleMs(125_000)).toBe('2m5s');
  });

  it('formats 300000ms as 5m', () => {
    expect(formatScheduleMs(300_000)).toBe('5m');
  });
});
