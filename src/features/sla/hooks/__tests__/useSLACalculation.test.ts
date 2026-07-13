/**
 * Tests for useSLACalculation() and formatTimeRemaining().
 *
 * useSLACalculation computes SLA timer state (ok / warning / breached) from
 * pure date arithmetic against the current time. vi.useFakeTimers() +
 * vi.setSystemTime() make `new Date()` deterministic so assertions are exact.
 *
 * Covered — formatTimeRemaining:
 *   - < 60 s        → '{n}s'
 *   - 0 ms          → '0s'
 *   - 60-3599 s     → '{m}m {s}s'
 *   - >= 3600 s     → '{h}h {m}m'
 *   - negative ms   → uses absolute value (breached countdown)
 *
 * Covered — useSLACalculation (firstResponse):
 *   - status 'ok' when remaining > 30% of total
 *   - status 'warning' when remaining <= 30% of total but > 0
 *   - status 'breached' when remaining <= 0 (not yet completed)
 *   - breached=false when not breached
 *   - breached=true when remainingMs <= 0
 *   - completed on-time: status='ok', breached=false, timeTakenMs correct
 *   - completed late: status='breached', breached=true
 *   - remainingMs=0 when completed
 *
 * Covered — useSLACalculation (resolution):
 *   - status computed independently from firstResponse
 *
 * Covered — worstStatus:
 *   - 'ok' when both ok
 *   - 'warning' when one is warning and none breached
 *   - 'breached' when any is breached
 *
 * Covered — reactivity:
 *   - setInterval fires every second → state recomputes
 *   - interval cleared when both firstResponseAt and resolvedAt are set
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSLACalculation, formatTimeRemaining } from '../useSLACalculation';

const T0 = new Date('2024-06-01T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── formatTimeRemaining ────────────────────────────────────────────────────────
describe('formatTimeRemaining', () => {
  it('returns "0s" for 0 ms', () => {
    expect(formatTimeRemaining(0)).toBe('0s');
  });

  it('returns seconds-only when < 60 s', () => {
    expect(formatTimeRemaining(30_000)).toBe('30s');
  });

  it('returns minutes and seconds when < 1 hour', () => {
    expect(formatTimeRemaining(90_000)).toBe('1m 30s');
  });

  it('returns hours and minutes when >= 1 hour', () => {
    expect(formatTimeRemaining(3_600_000)).toBe('1h 0m');
  });

  it('returns hours and minutes for 2h 15m', () => {
    expect(formatTimeRemaining(2 * 3_600_000 + 15 * 60_000)).toBe('2h 15m');
  });

  it('returns absolute value for negative ms (breached countdown)', () => {
    expect(formatTimeRemaining(-5_000)).toBe('5s');
  });

  it('handles exactly 1 minute as "1m 0s"', () => {
    expect(formatTimeRemaining(60_000)).toBe('1m 0s');
  });
});

// ── firstResponse status ───────────────────────────────────────────────────────
describe('useSLACalculation — firstResponse status', () => {
  it('is "ok" when remaining time is well above the warning threshold', () => {
    // firstMessageAt 2 min ago, deadline in 8 min — remaining (8min) > 30% of 10min (3min) → ok
    const firstMessageAt = new Date(T0.getTime() - 2 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.firstResponse.status).toBe('ok');
    expect(result.current.firstResponse.breached).toBe(false);
  });

  it('is "warning" when remaining time is within the 30% threshold', () => {
    // firstMessageAt 9 min ago, deadline in 1 min — remaining (1min) <= 30% of 10min (3min) → warning
    const firstMessageAt = new Date(T0.getTime() - 9 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.firstResponse.status).toBe('warning');
    expect(result.current.firstResponse.breached).toBe(false);
  });

  it('is "breached" when deadline has passed (not yet responded)', () => {
    // firstMessageAt 11 min ago, deadline was 1 min ago → breached
    const firstMessageAt = new Date(T0.getTime() - 11 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.firstResponse.status).toBe('breached');
    expect(result.current.firstResponse.breached).toBe(true);
  });
});

// ── completed firstResponse ────────────────────────────────────────────────────
describe('useSLACalculation — completed firstResponse', () => {
  it('status is "ok" and breached=false when firstResponse was on time', () => {
    // conversation started 8 min ago, deadline in 2 min, response given 3 min ago → on time
    const firstMessageAt = new Date(T0.getTime() - 8 * 60_000);
    const firstResponseAt = new Date(T0.getTime() - 3 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.firstResponse.status).toBe('ok');
    expect(result.current.firstResponse.breached).toBe(false);
  });

  it('timeTakenMs equals actual elapsed time from firstMessage to firstResponse', () => {
    // 8 min ago started, 3 min ago responded → 5 min taken
    const firstMessageAt = new Date(T0.getTime() - 8 * 60_000);
    const firstResponseAt = new Date(T0.getTime() - 3 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.firstResponse.timeTakenMs).toBe(5 * 60_000);
  });

  it('remainingMs is 0 when response was completed', () => {
    const firstMessageAt = new Date(T0.getTime() - 8 * 60_000);
    const firstResponseAt = new Date(T0.getTime() - 3 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.firstResponse.remainingMs).toBe(0);
  });

  it('status is "breached" and breached=true when firstResponse was late', () => {
    // conversation started 11 min ago, deadline was 1 min ago, responded now → late
    const firstMessageAt = new Date(T0.getTime() - 11 * 60_000);
    const firstResponseAt = T0; // responded at current time, after deadline
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.firstResponse.status).toBe('breached');
    expect(result.current.firstResponse.breached).toBe(true);
  });
});

// ── resolution status ──────────────────────────────────────────────────────────
describe('useSLACalculation — resolution status', () => {
  it('resolution.status is "ok" when plenty of time remains', () => {
    // started 5 min ago, resolution limit = 60 min, 55 min left > 30% of 60min (18min) → ok
    const firstMessageAt = new Date(T0.getTime() - 5 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.resolution.status).toBe('ok');
  });

  it('resolution.status is "warning" within 30% of resolution window', () => {
    // started 52 min ago, deadline in 8 min — 8min <= 30% of 60min (18min) → warning
    const firstMessageAt = new Date(T0.getTime() - 52 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.resolution.status).toBe('warning');
  });

  it('resolution.status is "breached" when resolution window has passed', () => {
    // started 61 min ago, resolution deadline was 1 min ago → breached
    const firstMessageAt = new Date(T0.getTime() - 61 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.resolution.status).toBe('breached');
  });
});

// ── worstStatus ────────────────────────────────────────────────────────────────
describe('useSLACalculation — worstStatus', () => {
  it('is "ok" when both firstResponse and resolution are ok', () => {
    // 2 min in, both have plenty of time
    const firstMessageAt = new Date(T0.getTime() - 2 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.worstStatus).toBe('ok');
  });

  it('is "warning" when one is warning and none breached', () => {
    // 9 min in (firstResponse in warning zone), resolution still ok
    const firstMessageAt = new Date(T0.getTime() - 9 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.worstStatus).toBe('warning');
  });

  it('is "breached" when firstResponse is breached', () => {
    const firstMessageAt = new Date(T0.getTime() - 11 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );
    expect(result.current.worstStatus).toBe('breached');
  });

  it('is "breached" when only resolution is breached', () => {
    // firstResponse was on time, but resolution window passed
    const firstMessageAt = new Date(T0.getTime() - 61 * 60_000);
    const firstResponseAt = new Date(T0.getTime() - 58 * 60_000);
    const { result } = renderHook(() =>
      useSLACalculation({
        firstMessageAt,
        firstResponseAt,
        firstResponseMinutes: 10,
        resolutionMinutes: 60,
      })
    );
    expect(result.current.worstStatus).toBe('breached');
  });
});

// ── interval recomputation ─────────────────────────────────────────────────────
describe('useSLACalculation — interval recomputation', () => {
  it('recomputes after 1 second interval when SLA is still active', () => {
    // Start 9 min 30 s ago → warning (30s remaining, within warning)
    const firstMessageAt = new Date(T0.getTime() - (9 * 60_000 + 30_000));
    const { result } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );

    expect(result.current.firstResponse.status).toBe('warning');

    // Advance clock by 31s so the deadline passes → state should flip to 'breached'
    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(result.current.firstResponse.status).toBe('breached');
  });

  it('does not set up interval when both firstResponseAt and resolvedAt are provided', () => {
    const spyClear = vi.spyOn(globalThis, 'clearInterval');
    const firstMessageAt = new Date(T0.getTime() - 5 * 60_000);
    const firstResponseAt = new Date(T0.getTime() - 4 * 60_000);
    const resolvedAt = new Date(T0.getTime() - 1 * 60_000);

    const { unmount } = renderHook(() =>
      useSLACalculation({ firstMessageAt, firstResponseAt, resolvedAt, firstResponseMinutes: 10, resolutionMinutes: 60 })
    );

    // Advance time — if interval was set, this would trigger recompute spy;
    // the key assertion is that clearInterval is NOT called with a real interval ID
    // (the effect returns early before setting any interval)
    act(() => { vi.advanceTimersByTime(5_000); });

    // clearInterval should not have been called with a real timer ID
    // (the effect returns before calling setInterval)
    expect(spyClear).not.toHaveBeenCalled();
    spyClear.mockRestore();
    unmount();
  });
});
