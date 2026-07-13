/**
 * Tests for agentService.getAgentStatus() — the pure status-classification helper
 * that maps a lastActivity ISO timestamp to one of three agent states.
 *
 * Classification rules (minutes since last activity, relative to "now"):
 *   < 5 min   → 'online'
 *   5–29 min  → 'away'
 *   ≥ 30 min  → 'offline'
 *   undefined → 'offline'
 *
 * Time is controlled via vi.useFakeTimers() + vi.setSystemTime() so tests are
 * deterministic regardless of when they run. No network, Supabase, or React deps.
 *
 * Covered:
 *   getAgentStatus — undefined / missing lastActivity
 *     - undefined → 'offline'
 *     - no-arg call → 'offline'
 *   getAgentStatus — 'online' boundary (< 5 min)
 *     - exactly now (0 ms ago) → 'online'
 *     - 1 minute ago → 'online'
 *     - 4 min 59 s ago (just below threshold) → 'online'
 *   getAgentStatus — 'away' boundary (5 ≤ min < 30)
 *     - exactly 5 minutes ago → 'away'
 *     - 10 minutes ago → 'away'
 *     - 29 minutes ago → 'away'
 *     - 29 min 59 s ago (just below 30 min) → 'away'
 *   getAgentStatus — 'offline' boundary (≥ 30 min)
 *     - exactly 30 minutes ago → 'offline'
 *     - 60 minutes ago → 'offline'
 *     - 24 hours ago → 'offline'
 *     - 7 days ago → 'offline'
 *   getAgentStatus — return type
 *     - always one of the three allowed string literals
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import { agentService } from '../agentService';

// Fix "now" at a known UTC point — all relative timestamps are computed from here.
const FIXED_NOW = new Date('2025-06-15T12:00:00.000Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

// ── helper ────────────────────────────────────────────────────────────────────

/** ISO string that is exactly `ms` milliseconds before FIXED_NOW. */
function ago(ms: number): string {
  return new Date(FIXED_NOW.getTime() - ms).toISOString();
}

const SEC  = 1_000;
const MIN  = 60 * SEC;
const HOUR = 60 * MIN;
const DAY  = 24 * HOUR;

// ── undefined / missing lastActivity ─────────────────────────────────────────

describe('getAgentStatus — undefined / missing', () => {
  it('returns "offline" when lastActivity is undefined', () => {
    expect(agentService.getAgentStatus(undefined)).toBe('offline');
  });

  it('returns "offline" when called with no argument', () => {
    expect(agentService.getAgentStatus()).toBe('offline');
  });
});

// ── 'online' boundary (< 5 min) ──────────────────────────────────────────────

describe('getAgentStatus — online (< 5 min)', () => {
  it('returns "online" when lastActivity is exactly now (0 ms ago)', () => {
    expect(agentService.getAgentStatus(ago(0))).toBe('online');
  });

  it('returns "online" when lastActivity is 30 seconds ago', () => {
    expect(agentService.getAgentStatus(ago(30 * SEC))).toBe('online');
  });

  it('returns "online" when lastActivity is 1 minute ago', () => {
    expect(agentService.getAgentStatus(ago(1 * MIN))).toBe('online');
  });

  it('returns "online" when lastActivity is 4 min 59 s ago (just below threshold)', () => {
    expect(agentService.getAgentStatus(ago(4 * MIN + 59 * SEC))).toBe('online');
  });
});

// ── 'away' boundary (5 ≤ min < 30) ──────────────────────────────────────────

describe('getAgentStatus — away (5 ≤ min < 30)', () => {
  it('returns "away" when lastActivity is exactly 5 minutes ago', () => {
    expect(agentService.getAgentStatus(ago(5 * MIN))).toBe('away');
  });

  it('returns "away" when lastActivity is 10 minutes ago', () => {
    expect(agentService.getAgentStatus(ago(10 * MIN))).toBe('away');
  });

  it('returns "away" when lastActivity is 15 minutes ago', () => {
    expect(agentService.getAgentStatus(ago(15 * MIN))).toBe('away');
  });

  it('returns "away" when lastActivity is 29 minutes ago', () => {
    expect(agentService.getAgentStatus(ago(29 * MIN))).toBe('away');
  });

  it('returns "away" when lastActivity is 29 min 59 s ago (just below 30 min)', () => {
    expect(agentService.getAgentStatus(ago(29 * MIN + 59 * SEC))).toBe('away');
  });
});

// ── 'offline' boundary (≥ 30 min) ────────────────────────────────────────────

describe('getAgentStatus — offline (≥ 30 min)', () => {
  it('returns "offline" when lastActivity is exactly 30 minutes ago', () => {
    expect(agentService.getAgentStatus(ago(30 * MIN))).toBe('offline');
  });

  it('returns "offline" when lastActivity is 31 minutes ago', () => {
    expect(agentService.getAgentStatus(ago(31 * MIN))).toBe('offline');
  });

  it('returns "offline" when lastActivity is 60 minutes ago', () => {
    expect(agentService.getAgentStatus(ago(60 * MIN))).toBe('offline');
  });

  it('returns "offline" when lastActivity is 24 hours ago', () => {
    expect(agentService.getAgentStatus(ago(24 * HOUR))).toBe('offline');
  });

  it('returns "offline" when lastActivity is 7 days ago', () => {
    expect(agentService.getAgentStatus(ago(7 * DAY))).toBe('offline');
  });
});

// ── return type ───────────────────────────────────────────────────────────────

describe('getAgentStatus — return type', () => {
  it('always returns one of the three allowed string literals', () => {
    const allowed = ['online', 'away', 'offline'] as const;
    const inputs = [
      undefined,
      ago(0),
      ago(1 * MIN),
      ago(5 * MIN),
      ago(10 * MIN),
      ago(30 * MIN),
      ago(2 * HOUR),
    ];
    for (const input of inputs) {
      expect(allowed).toContain(agentService.getAgentStatus(input));
    }
  });

  it('returns a string (not null, undefined, or other type)', () => {
    expect(typeof agentService.getAgentStatus(ago(5 * MIN))).toBe('string');
  });
});
