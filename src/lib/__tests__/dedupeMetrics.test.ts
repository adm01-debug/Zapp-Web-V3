import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordDedupeEvent,
  getDedupeSnapshot,
  subscribeDedupeEvents,
  __resetDedupeMetricsForTests,
} from '@/lib/dedupeMetrics';

beforeEach(() => {
  __resetDedupeMetricsForTests();
});

// ── getDedupeSnapshot — initial state ─────────────────────────────────────────

describe('getDedupeSnapshot — initial state', () => {
  it('events array is empty after reset', () => {
    expect(getDedupeSnapshot().events).toHaveLength(0);
  });

  it('all counters are 0 after reset', () => {
    const { counters } = getDedupeSnapshot();
    expect(counters.leader).toBe(0);
    expect(counters.followerReplay).toBe(0);
    expect(counters.followerFallback).toBe(0);
    expect(counters.total).toBe(0);
    expect(counters.saved).toBe(0);
  });
});

// ── recordDedupeEvent — leader ────────────────────────────────────────────────

describe('recordDedupeEvent — leader outcome', () => {
  it('increments leader counter', () => {
    recordDedupeEvent({ key: 'k1', outcome: 'leader', durationMs: 100, ok: true });
    expect(getDedupeSnapshot().counters.leader).toBe(1);
  });

  it('increments total counter', () => {
    recordDedupeEvent({ key: 'k1', outcome: 'leader', durationMs: 100, ok: true });
    expect(getDedupeSnapshot().counters.total).toBe(1);
  });

  it('does not increment followerReplay or followerFallback for leader', () => {
    recordDedupeEvent({ key: 'k1', outcome: 'leader', durationMs: 100, ok: true });
    const { counters } = getDedupeSnapshot();
    expect(counters.followerReplay).toBe(0);
    expect(counters.followerFallback).toBe(0);
  });

  it('does not increment saved for leader ok=true', () => {
    recordDedupeEvent({ key: 'k1', outcome: 'leader', durationMs: 100, ok: true });
    expect(getDedupeSnapshot().counters.saved).toBe(0);
  });
});

// ── recordDedupeEvent — follower-replay ───────────────────────────────────────

describe('recordDedupeEvent — follower-replay outcome', () => {
  it('increments followerReplay counter', () => {
    recordDedupeEvent({ key: 'k', outcome: 'follower-replay', durationMs: 10, ok: true });
    expect(getDedupeSnapshot().counters.followerReplay).toBe(1);
  });

  it('increments saved when ok=true on follower-replay', () => {
    recordDedupeEvent({ key: 'k', outcome: 'follower-replay', durationMs: 10, ok: true });
    expect(getDedupeSnapshot().counters.saved).toBe(1);
  });

  it('does NOT increment saved when ok=false on follower-replay', () => {
    recordDedupeEvent({ key: 'k', outcome: 'follower-replay', durationMs: 10, ok: false });
    expect(getDedupeSnapshot().counters.saved).toBe(0);
  });
});

// ── recordDedupeEvent — follower-fallback ─────────────────────────────────────

describe('recordDedupeEvent — follower-fallback outcome', () => {
  it('increments followerFallback counter', () => {
    recordDedupeEvent({ key: 'k', outcome: 'follower-fallback', durationMs: 50, ok: false });
    expect(getDedupeSnapshot().counters.followerFallback).toBe(1);
  });

  it('does not affect leader or followerReplay counters', () => {
    recordDedupeEvent({ key: 'k', outcome: 'follower-fallback', durationMs: 50, ok: true });
    const { counters } = getDedupeSnapshot();
    expect(counters.leader).toBe(0);
    expect(counters.followerReplay).toBe(0);
  });

  it('does not increment saved for follower-fallback', () => {
    recordDedupeEvent({ key: 'k', outcome: 'follower-fallback', durationMs: 50, ok: true });
    expect(getDedupeSnapshot().counters.saved).toBe(0);
  });
});

// ── recordDedupeEvent — returned event shape ───────────────────────────────────

describe('recordDedupeEvent — returned event', () => {
  it('returns an event with the provided key', () => {
    const ev = recordDedupeEvent({ key: 'mykey', outcome: 'leader', durationMs: 200, ok: true });
    expect(ev.key).toBe('mykey');
  });

  it('returns an event with the provided outcome', () => {
    const ev = recordDedupeEvent({ key: 'k', outcome: 'follower-replay', durationMs: 10, ok: true });
    expect(ev.outcome).toBe('follower-replay');
  });

  it('returns an event with the provided ok flag', () => {
    const ev = recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 10, ok: false });
    expect(ev.ok).toBe(false);
  });

  it('rounds and floors durationMs at 0 minimum', () => {
    const ev = recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: -5, ok: true });
    expect(ev.durationMs).toBe(0);
  });

  it('rounds durationMs to integer', () => {
    const ev = recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 99.7, ok: true });
    expect(Number.isInteger(ev.durationMs)).toBe(true);
  });

  it('returns an event with a non-empty id', () => {
    const ev = recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 10, ok: true });
    expect(ev.id).toBeTruthy();
  });

  it('returns an event with an ISO timestamp string', () => {
    const ev = recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 10, ok: true });
    expect(() => new Date(ev.at)).not.toThrow();
    expect(isNaN(new Date(ev.at).getTime())).toBe(false);
  });
});

// ── events ring buffer ─────────────────────────────────────────────────────────

describe('events ring buffer', () => {
  it('stores the most recent event first (unshift)', () => {
    recordDedupeEvent({ key: 'first', outcome: 'leader', durationMs: 1, ok: true });
    recordDedupeEvent({ key: 'second', outcome: 'leader', durationMs: 2, ok: true });
    expect(getDedupeSnapshot().events[0].key).toBe('second');
  });

  it('caps events at 50', () => {
    for (let i = 0; i < 60; i++) {
      recordDedupeEvent({ key: `k${i}`, outcome: 'leader', durationMs: i, ok: true });
    }
    expect(getDedupeSnapshot().events).toHaveLength(50);
  });

  it('keeps the 50 most recent events (oldest evicted)', () => {
    for (let i = 0; i < 55; i++) {
      recordDedupeEvent({ key: `k${i}`, outcome: 'leader', durationMs: i, ok: true });
    }
    const keys = getDedupeSnapshot().events.map(e => e.key);
    expect(keys).not.toContain('k0');
    expect(keys).toContain('k54');
  });
});

// ── getDedupeSnapshot — isolation ─────────────────────────────────────────────

describe('getDedupeSnapshot — isolation', () => {
  it('returns a copy of the events array (mutation does not affect store)', () => {
    recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 1, ok: true });
    const snap = getDedupeSnapshot();
    snap.events.length = 0;
    expect(getDedupeSnapshot().events).toHaveLength(1);
  });

  it('returns a copy of the counters object', () => {
    recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 1, ok: true });
    const snap = getDedupeSnapshot();
    snap.counters.leader = 999;
    expect(getDedupeSnapshot().counters.leader).toBe(1);
  });
});

// ── subscribeDedupeEvents ─────────────────────────────────────────────────────

describe('subscribeDedupeEvents', () => {
  it('listener is called when an event is recorded', () => {
    let callCount = 0;
    subscribeDedupeEvents(() => callCount++);
    recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 1, ok: true });
    expect(callCount).toBe(1);
  });

  it('returns an unsubscribe function that stops notifications', () => {
    let callCount = 0;
    const unsub = subscribeDedupeEvents(() => callCount++);
    unsub();
    recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 1, ok: true });
    expect(callCount).toBe(0);
  });

  it('multiple listeners all receive the event', () => {
    const counts = [0, 0];
    subscribeDedupeEvents(() => counts[0]++);
    subscribeDedupeEvents(() => counts[1]++);
    recordDedupeEvent({ key: 'k', outcome: 'leader', durationMs: 1, ok: true });
    expect(counts).toEqual([1, 1]);
  });
});

// ── multiple events accumulate correctly ──────────────────────────────────────

describe('counter accumulation', () => {
  it('total equals sum of all events', () => {
    recordDedupeEvent({ key: 'a', outcome: 'leader', durationMs: 1, ok: true });
    recordDedupeEvent({ key: 'b', outcome: 'follower-replay', durationMs: 1, ok: true });
    recordDedupeEvent({ key: 'c', outcome: 'follower-fallback', durationMs: 1, ok: false });
    expect(getDedupeSnapshot().counters.total).toBe(3);
  });

  it('saved counts only successful follower-replays', () => {
    recordDedupeEvent({ key: 'a', outcome: 'follower-replay', durationMs: 1, ok: true });
    recordDedupeEvent({ key: 'b', outcome: 'follower-replay', durationMs: 1, ok: false });
    recordDedupeEvent({ key: 'c', outcome: 'follower-replay', durationMs: 1, ok: true });
    expect(getDedupeSnapshot().counters.saved).toBe(2);
  });
});
