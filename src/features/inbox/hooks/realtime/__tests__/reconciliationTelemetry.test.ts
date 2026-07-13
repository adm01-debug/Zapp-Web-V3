/**
 * Tests for reconciliationTelemetry.ts — a module-level telemetry singleton
 * for optimistic reconciliation match events.
 *
 * State is reset between every test via resetReconciliationStats().
 * No network, React, or Supabase dependencies.
 *
 * Functions under test:
 *   recordMatch(ev)
 *   getReconciliationStats()
 *   getRecentMatches(limit?)
 *   subscribeReconciliation(fn)
 *   resetReconciliationStats()
 *
 * Covered:
 *   recordMatch
 *     - increments total counter
 *     - increments byStrategy counter for the correct strategy
 *     - increments byMessageType counter
 *     - increments byStrategyAndType matrix
 *     - appends to the recent-events ring buffer
 *     - fires subscribed listeners
 *     - does not throw when a listener throws
 *     - adds an 'at' timestamp (number)
 *     - appends deltaMs to the event when provided
 *   getReconciliationStats
 *     - starts at zero counters
 *     - returns correct totals after multiple records
 *     - returns a shallow copy — mutation does not affect internal state
 *     - byStrategy tracks each strategy independently
 *     - byStrategyAndType matrix is correct
 *   getRecentMatches
 *     - returns [] when nothing recorded
 *     - returns the last N events (default 20)
 *     - custom limit is respected
 *     - ring buffer caps at 100 entries (oldest dropped)
 *   subscribeReconciliation
 *     - listener fires on recordMatch
 *     - unsubscribe stops future calls
 *     - multiple listeners all fire
 *   resetReconciliationStats
 *     - resets all counters to zero
 *     - clears the recent-events ring buffer
 *     - does not affect active subscriptions
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordMatch,
  getReconciliationStats,
  getRecentMatches,
  subscribeReconciliation,
  resetReconciliationStats,
} from '../reconciliationTelemetry';
import type { MatchEvent } from '../reconciliationTelemetry';

beforeEach(() => {
  resetReconciliationStats();
});

// ── helpers ────────────────────────────────────────────────────────────────

function makeEvent(
  strategy: MatchEvent['strategy'] = 'external_id',
  messageType = 'text',
): Omit<MatchEvent, 'at'> {
  return {
    strategy,
    messageType,
    optimisticId: `opt-${Math.random()}`,
    canonicalId: `can-${Math.random()}`,
  };
}

// ── getReconciliationStats — initial state ─────────────────────────────────

describe('getReconciliationStats — initial state', () => {
  it('starts with total = 0', () => {
    expect(getReconciliationStats().total).toBe(0);
  });

  it('starts with all strategy counters at 0', () => {
    const { byStrategy } = getReconciliationStats();
    expect(byStrategy.external_id).toBe(0);
    expect(byStrategy.text_fallback).toBe(0);
    expect(byStrategy.media_fallback).toBe(0);
  });

  it('starts with empty byMessageType', () => {
    expect(getReconciliationStats().byMessageType).toEqual({});
  });

  it('starts with empty byStrategyAndType matrices', () => {
    const { byStrategyAndType } = getReconciliationStats();
    expect(byStrategyAndType.external_id).toEqual({});
    expect(byStrategyAndType.text_fallback).toEqual({});
    expect(byStrategyAndType.media_fallback).toEqual({});
  });
});

// ── recordMatch — counter increments ──────────────────────────────────────

describe('recordMatch — counter increments', () => {
  it('increments total by 1 per call', () => {
    recordMatch(makeEvent());
    expect(getReconciliationStats().total).toBe(1);
    recordMatch(makeEvent());
    expect(getReconciliationStats().total).toBe(2);
  });

  it('increments the correct byStrategy counter', () => {
    recordMatch(makeEvent('external_id'));
    recordMatch(makeEvent('external_id'));
    recordMatch(makeEvent('text_fallback'));
    const { byStrategy } = getReconciliationStats();
    expect(byStrategy.external_id).toBe(2);
    expect(byStrategy.text_fallback).toBe(1);
    expect(byStrategy.media_fallback).toBe(0);
  });

  it('increments byMessageType for the correct type', () => {
    recordMatch(makeEvent('external_id', 'text'));
    recordMatch(makeEvent('external_id', 'text'));
    recordMatch(makeEvent('external_id', 'audio'));
    const { byMessageType } = getReconciliationStats();
    expect(byMessageType['text']).toBe(2);
    expect(byMessageType['audio']).toBe(1);
  });

  it('increments byStrategyAndType[strategy][messageType]', () => {
    recordMatch(makeEvent('external_id', 'text'));
    recordMatch(makeEvent('text_fallback', 'text'));
    recordMatch(makeEvent('text_fallback', 'audio'));
    const { byStrategyAndType } = getReconciliationStats();
    expect(byStrategyAndType.external_id['text']).toBe(1);
    expect(byStrategyAndType.text_fallback['text']).toBe(1);
    expect(byStrategyAndType.text_fallback['audio']).toBe(1);
    expect(byStrategyAndType.media_fallback['text']).toBeUndefined();
  });

  it('adds an "at" timestamp (number) to the event', () => {
    const before = Date.now();
    recordMatch(makeEvent());
    const after = Date.now();
    const [ev] = getRecentMatches(1);
    expect(typeof ev.at).toBe('number');
    expect(ev.at).toBeGreaterThanOrEqual(before);
    expect(ev.at).toBeLessThanOrEqual(after);
  });

  it('preserves deltaMs when provided', () => {
    recordMatch({ ...makeEvent('text_fallback'), deltaMs: 42 });
    expect(getRecentMatches(1)[0].deltaMs).toBe(42);
  });

  it('all three strategies accumulate independently', () => {
    for (let i = 0; i < 3; i++) recordMatch(makeEvent('external_id', 'image'));
    for (let i = 0; i < 2; i++) recordMatch(makeEvent('text_fallback', 'video'));
    recordMatch(makeEvent('media_fallback', 'sticker'));
    const s = getReconciliationStats();
    expect(s.total).toBe(6);
    expect(s.byStrategy.external_id).toBe(3);
    expect(s.byStrategy.text_fallback).toBe(2);
    expect(s.byStrategy.media_fallback).toBe(1);
  });
});

// ── getReconciliationStats — copy safety ──────────────────────────────────

describe('getReconciliationStats — returns a shallow copy', () => {
  it('mutating the returned object does not change internal counters', () => {
    recordMatch(makeEvent());
    const stats = getReconciliationStats();
    stats.total = 999;
    stats.byStrategy.external_id = 999;
    expect(getReconciliationStats().total).toBe(1);
    expect(getReconciliationStats().byStrategy.external_id).toBe(1);
  });
});

// ── getRecentMatches ───────────────────────────────────────────────────────

describe('getRecentMatches', () => {
  it('returns [] when nothing has been recorded', () => {
    expect(getRecentMatches()).toEqual([]);
  });

  it('returns events in chronological order (oldest first)', () => {
    recordMatch(makeEvent('external_id', 'text'));
    recordMatch(makeEvent('text_fallback', 'audio'));
    const recent = getRecentMatches();
    expect(recent[0].strategy).toBe('external_id');
    expect(recent[1].strategy).toBe('text_fallback');
  });

  it('default limit is 20 — returns last 20 events', () => {
    for (let i = 0; i < 25; i++) {
      recordMatch(makeEvent('external_id', `type-${i}`));
    }
    const recent = getRecentMatches();
    expect(recent).toHaveLength(20);
    expect(recent[recent.length - 1].messageType).toBe('type-24');
  });

  it('custom limit is respected', () => {
    for (let i = 0; i < 10; i++) {
      recordMatch(makeEvent('external_id', `type-${i}`));
    }
    expect(getRecentMatches(3)).toHaveLength(3);
    expect(getRecentMatches(3)[2].messageType).toBe('type-9');
  });

  it('limit = 1 returns only the most recent event', () => {
    recordMatch(makeEvent('external_id', 'first'));
    recordMatch(makeEvent('text_fallback', 'last'));
    expect(getRecentMatches(1)[0].strategy).toBe('text_fallback');
  });

  it('ring buffer caps at 100 entries — oldest are dropped', () => {
    for (let i = 0; i < 110; i++) {
      recordMatch(makeEvent('external_id', `type-${i}`));
    }
    // getRecentMatches(100) returns all currently stored
    const all = getRecentMatches(100);
    expect(all).toHaveLength(100);
    expect(all[0].messageType).toBe('type-10');
    expect(all[99].messageType).toBe('type-109');
  });
});

// ── subscribeReconciliation ────────────────────────────────────────────────

describe('subscribeReconciliation', () => {
  it('fires the listener when recordMatch is called', () => {
    const cb = vi.fn();
    subscribeReconciliation(cb);
    recordMatch(makeEvent());
    expect(cb).toHaveBeenCalledOnce();
  });

  it('receives the full MatchEvent with "at" field', () => {
    const cb = vi.fn();
    subscribeReconciliation(cb);
    recordMatch(makeEvent('text_fallback', 'audio'));
    const event: MatchEvent = cb.mock.calls[0][0];
    expect(event.strategy).toBe('text_fallback');
    expect(event.messageType).toBe('audio');
    expect(typeof event.at).toBe('number');
  });

  it('unsubscribe stops the listener from firing', () => {
    const cb = vi.fn();
    const unsub = subscribeReconciliation(cb);
    recordMatch(makeEvent());
    unsub();
    recordMatch(makeEvent());
    expect(cb).toHaveBeenCalledOnce();
  });

  it('multiple listeners all fire on each recordMatch', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeReconciliation(a);
    subscribeReconciliation(b);
    recordMatch(makeEvent());
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('does not throw when a listener throws', () => {
    subscribeReconciliation(() => { throw new Error('boom'); });
    expect(() => recordMatch(makeEvent())).not.toThrow();
  });
});

// ── resetReconciliationStats ───────────────────────────────────────────────

describe('resetReconciliationStats', () => {
  it('resets total to 0', () => {
    recordMatch(makeEvent());
    resetReconciliationStats();
    expect(getReconciliationStats().total).toBe(0);
  });

  it('resets all strategy counters to 0', () => {
    recordMatch(makeEvent('text_fallback'));
    resetReconciliationStats();
    const { byStrategy } = getReconciliationStats();
    expect(byStrategy.external_id).toBe(0);
    expect(byStrategy.text_fallback).toBe(0);
    expect(byStrategy.media_fallback).toBe(0);
  });

  it('clears byMessageType', () => {
    recordMatch(makeEvent('external_id', 'text'));
    resetReconciliationStats();
    expect(getReconciliationStats().byMessageType).toEqual({});
  });

  it('clears byStrategyAndType matrices', () => {
    recordMatch(makeEvent('external_id', 'image'));
    resetReconciliationStats();
    expect(getReconciliationStats().byStrategyAndType.external_id).toEqual({});
  });

  it('clears the recent-events ring buffer', () => {
    recordMatch(makeEvent());
    resetReconciliationStats();
    expect(getRecentMatches()).toEqual([]);
  });

  it('does not unsubscribe active listeners', () => {
    const cb = vi.fn();
    subscribeReconciliation(cb);
    resetReconciliationStats();
    recordMatch(makeEvent());
    expect(cb).toHaveBeenCalledOnce();
  });
});
