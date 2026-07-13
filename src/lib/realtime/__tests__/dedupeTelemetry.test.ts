import { describe, it, expect, beforeEach } from 'vitest';
import {
  inferKeyKind,
  extractNamespace,
  recordDedupeEvent,
  getDedupeTelemetrySnapshot,
  resetDedupeTelemetry,
  type DedupeKeyKind,
  type DedupeHitReason,
  type DedupeMissReason,
} from '../dedupeTelemetry';

beforeEach(() => {
  resetDedupeTelemetry();
});

// ── extractNamespace ──────────────────────────────────────────────────────────

describe('extractNamespace', () => {
  it('returns the prefix before the first ":"', () => {
    expect(extractNamespace('inbox:initial:5511:100')).toBe('inbox');
  });

  it('returns the whole string when there is no ":"', () => {
    expect(extractNamespace('plainkey')).toBe('plainkey');
  });

  it('handles a key with a single segment after the colon', () => {
    expect(extractNamespace('older:abc123')).toBe('older');
  });

  it('handles multiple colons — only splits on first', () => {
    expect(extractNamespace('sub:a:b:c')).toBe('sub');
  });

  it('returns empty string for a key that starts with ":"', () => {
    expect(extractNamespace(':foo')).toBe('');
  });

  it('returns the full key for an empty string', () => {
    expect(extractNamespace('')).toBe('');
  });
});

// ── inferKeyKind — known idempotency namespaces ───────────────────────────────

describe('inferKeyKind — known idempotency namespaces', () => {
  const IDEMPOTENCY_CASES = [
    'inbox:initial:5511:100',
    'older:cursor:5511',
    'sub:subscriber1',
    'multi:tab:test',
    'persist:cache:key',
    'remote:endpoint:v1',
  ];

  it.each(IDEMPOTENCY_CASES)('"%s" → idempotency', (key) => {
    expect(inferKeyKind(key)).toBe('idempotency');
  });
});

// ── inferKeyKind — hash keys ──────────────────────────────────────────────────

describe('inferKeyKind — hash keys', () => {
  it('returns "hash" for a 32-char lowercase hex string', () => {
    expect(inferKeyKind('a1b2c3d4e5f6789012345678901234ab')).toBe('hash');
  });

  it('returns "hash" for a 64-char hex string (SHA-256 style)', () => {
    expect(inferKeyKind('a'.repeat(32) + 'b'.repeat(32))).toBe('hash');
  });

  it('returns "hash" for an uppercase hex string of 32+ chars', () => {
    expect(inferKeyKind('A1B2C3D4E5F6789012345678901234AB')).toBe('hash');
  });

  it('does NOT return "hash" for 31-char hex string (too short)', () => {
    expect(inferKeyKind('a1b2c3d4e5f6789012345678901234a')).not.toBe('hash');
  });
});

// ── inferKeyKind — generic colon-separated keys ───────────────────────────────

describe('inferKeyKind — generic colon-separated keys', () => {
  it('returns "idempotency" for an unknown namespace with colons', () => {
    expect(inferKeyKind('custom:segment:more')).toBe('idempotency');
  });

  it('returns "idempotency" for "foo:bar"', () => {
    expect(inferKeyKind('foo:bar')).toBe('idempotency');
  });
});

// ── inferKeyKind — unknown ────────────────────────────────────────────────────

describe('inferKeyKind — unknown keys', () => {
  it('returns "unknown" for empty string', () => {
    expect(inferKeyKind('')).toBe('unknown');
  });

  it('returns "unknown" for a short word without colons', () => {
    expect(inferKeyKind('plainkey')).toBe('unknown');
  });

  it('returns "unknown" for a non-string value (null)', () => {
    expect(inferKeyKind(null as unknown as string)).toBe('unknown');
  });

  it('returns "unknown" for a non-hex short string', () => {
    expect(inferKeyKind('xyz123')).toBe('unknown');
  });
});

// ── getDedupeTelemetrySnapshot — initial state ────────────────────────────────

describe('getDedupeTelemetrySnapshot — initial state', () => {
  it('total is 0', () => {
    expect(getDedupeTelemetrySnapshot().total).toBe(0);
  });

  it('hits is 0', () => {
    expect(getDedupeTelemetrySnapshot().hits).toBe(0);
  });

  it('misses is 0', () => {
    expect(getDedupeTelemetrySnapshot().misses).toBe(0);
  });

  it('hitRate is 0', () => {
    expect(getDedupeTelemetrySnapshot().hitRate).toBe(0);
  });

  it('recentEvents is empty', () => {
    expect(getDedupeTelemetrySnapshot().recentEvents).toHaveLength(0);
  });

  it('byReason has all 7 keys set to 0', () => {
    const { byReason } = getDedupeTelemetrySnapshot();
    expect(byReason.memory_cache).toBe(0);
    expect(byReason.persisted_cache).toBe(0);
    expect(byReason.inflight_local).toBe(0);
    expect(byReason.broadcast_wait).toBe(0);
    expect(byReason.late_cache).toBe(0);
    expect(byReason.lock_acquired_lead).toBe(0);
    expect(byReason.fallback_after_wait).toBe(0);
  });

  it('byKeyKind has 3 keys all set to 0', () => {
    const { byKeyKind } = getDedupeTelemetrySnapshot();
    expect(byKeyKind.idempotency).toBe(0);
    expect(byKeyKind.hash).toBe(0);
    expect(byKeyKind.unknown).toBe(0);
  });

  it('byNamespace is an empty object', () => {
    expect(getDedupeTelemetrySnapshot().byNamespace).toEqual({});
  });
});

// ── recordDedupeEvent — hit reasons ──────────────────────────────────────────

describe('recordDedupeEvent — hit reasons increment hits', () => {
  const HIT_REASONS: DedupeHitReason[] = [
    'memory_cache',
    'persisted_cache',
    'inflight_local',
    'broadcast_wait',
    'late_cache',
  ];

  it.each(HIT_REASONS)('reason "%s" counts as a hit', (reason) => {
    recordDedupeEvent({ key: 'inbox:test:123', reason });
    const snap = getDedupeTelemetrySnapshot();
    expect(snap.hits).toBe(1);
    expect(snap.misses).toBe(0);
    expect(snap.total).toBe(1);
    expect(snap.byReason[reason]).toBe(1);
  });
});

// ── recordDedupeEvent — miss reasons ─────────────────────────────────────────

describe('recordDedupeEvent — miss reasons increment misses', () => {
  const MISS_REASONS: DedupeMissReason[] = [
    'lock_acquired_lead',
    'fallback_after_wait',
  ];

  it.each(MISS_REASONS)('reason "%s" counts as a miss', (reason) => {
    recordDedupeEvent({ key: 'inbox:test:123', reason });
    const snap = getDedupeTelemetrySnapshot();
    expect(snap.misses).toBe(1);
    expect(snap.hits).toBe(0);
    expect(snap.total).toBe(1);
    expect(snap.byReason[reason]).toBe(1);
  });
});

// ── recordDedupeEvent — hitRate ───────────────────────────────────────────────

describe('recordDedupeEvent — hitRate calculation', () => {
  it('hitRate is 1.0 after one hit', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    expect(getDedupeTelemetrySnapshot().hitRate).toBe(1);
  });

  it('hitRate is 0.5 after one hit and one miss', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    recordDedupeEvent({ key: 'inbox:b', reason: 'lock_acquired_lead' });
    expect(getDedupeTelemetrySnapshot().hitRate).toBe(0.5);
  });

  it('hitRate is 0 after one miss', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'lock_acquired_lead' });
    expect(getDedupeTelemetrySnapshot().hitRate).toBe(0);
  });

  it('hitRate is 0.75 after 3 hits and 1 miss', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    recordDedupeEvent({ key: 'inbox:b', reason: 'memory_cache' });
    recordDedupeEvent({ key: 'inbox:c', reason: 'memory_cache' });
    recordDedupeEvent({ key: 'inbox:d', reason: 'lock_acquired_lead' });
    expect(getDedupeTelemetrySnapshot().hitRate).toBe(0.75);
  });
});

// ── recordDedupeEvent — namespace tracking ────────────────────────────────────

describe('recordDedupeEvent — namespace tracking', () => {
  it('creates a namespace entry on first event', () => {
    recordDedupeEvent({ key: 'inbox:test', reason: 'memory_cache' });
    const snap = getDedupeTelemetrySnapshot();
    expect(snap.byNamespace['inbox']).toBeDefined();
    expect(snap.byNamespace['inbox'].hits).toBe(1);
    expect(snap.byNamespace['inbox'].misses).toBe(0);
  });

  it('tracks hits and misses per namespace separately', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    recordDedupeEvent({ key: 'inbox:b', reason: 'lock_acquired_lead' });
    recordDedupeEvent({ key: 'older:c', reason: 'memory_cache' });
    const snap = getDedupeTelemetrySnapshot();
    expect(snap.byNamespace['inbox'].hits).toBe(1);
    expect(snap.byNamespace['inbox'].misses).toBe(1);
    expect(snap.byNamespace['older'].hits).toBe(1);
    expect(snap.byNamespace['older'].misses).toBe(0);
  });

  it('uses custom namespace when provided', () => {
    recordDedupeEvent({ key: 'any-key', reason: 'memory_cache', namespace: 'custom-ns' });
    const snap = getDedupeTelemetrySnapshot();
    expect(snap.byNamespace['custom-ns']).toBeDefined();
    expect(snap.byNamespace['custom-ns'].hits).toBe(1);
  });
});

// ── recordDedupeEvent — keyKind inference ─────────────────────────────────────

describe('recordDedupeEvent — keyKind inference', () => {
  it('infers "idempotency" for inbox:* keys', () => {
    recordDedupeEvent({ key: 'inbox:initial:5511:100', reason: 'memory_cache' });
    const snap = getDedupeTelemetrySnapshot();
    expect(snap.byKeyKind.idempotency).toBe(1);
  });

  it('uses explicit keyKind when provided', () => {
    recordDedupeEvent({ key: 'inbox:test', reason: 'memory_cache', keyKind: 'hash' });
    const snap = getDedupeTelemetrySnapshot();
    expect(snap.byKeyKind.hash).toBe(1);
    expect(snap.byKeyKind.idempotency).toBe(0);
  });
});

// ── recordDedupeEvent — recentEvents ─────────────────────────────────────────

describe('recordDedupeEvent — recentEvents', () => {
  it('appends each event to recentEvents', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    recordDedupeEvent({ key: 'inbox:b', reason: 'lock_acquired_lead' });
    expect(getDedupeTelemetrySnapshot().recentEvents).toHaveLength(2);
  });

  it('event has correct key and reason', () => {
    recordDedupeEvent({ key: 'inbox:test:123', reason: 'memory_cache' });
    const evt = getDedupeTelemetrySnapshot().recentEvents[0];
    expect(evt.key).toBe('inbox:test:123');
    expect(evt.reason).toBe('memory_cache');
    expect(evt.outcome).toBe('hit');
    expect(evt.namespace).toBe('inbox');
  });

  it('event has a ts (timestamp) number', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    const evt = getDedupeTelemetrySnapshot().recentEvents[0];
    expect(typeof evt.ts).toBe('number');
    expect(evt.ts).toBeGreaterThan(0);
  });

  it('event captures durationMs when provided', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'lock_acquired_lead', durationMs: 42 });
    const evt = getDedupeTelemetrySnapshot().recentEvents[0];
    expect(evt.durationMs).toBe(42);
  });

  it('event captures errorMessage when provided', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'fallback_after_wait', errorMessage: 'timeout' });
    const evt = getDedupeTelemetrySnapshot().recentEvents[0];
    expect(evt.errorMessage).toBe('timeout');
  });
});

// ── resetDedupeTelemetry ──────────────────────────────────────────────────────

describe('resetDedupeTelemetry', () => {
  it('resets total to 0', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    resetDedupeTelemetry();
    expect(getDedupeTelemetrySnapshot().total).toBe(0);
  });

  it('resets hits to 0', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    resetDedupeTelemetry();
    expect(getDedupeTelemetrySnapshot().hits).toBe(0);
  });

  it('resets misses to 0', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'lock_acquired_lead' });
    resetDedupeTelemetry();
    expect(getDedupeTelemetrySnapshot().misses).toBe(0);
  });

  it('clears recentEvents', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    resetDedupeTelemetry();
    expect(getDedupeTelemetrySnapshot().recentEvents).toHaveLength(0);
  });

  it('clears byNamespace', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    resetDedupeTelemetry();
    expect(getDedupeTelemetrySnapshot().byNamespace).toEqual({});
  });

  it('resets byReason counters to 0', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    resetDedupeTelemetry();
    const { byReason } = getDedupeTelemetrySnapshot();
    expect(byReason.memory_cache).toBe(0);
    expect(byReason.lock_acquired_lead).toBe(0);
  });

  it('allows recording again after reset', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    resetDedupeTelemetry();
    recordDedupeEvent({ key: 'inbox:b', reason: 'lock_acquired_lead' });
    expect(getDedupeTelemetrySnapshot().total).toBe(1);
  });
});

// ── getDedupeTelemetrySnapshot — returns copies ───────────────────────────────

describe('getDedupeTelemetrySnapshot — returns independent copies', () => {
  it('mutating the snapshot byReason does not affect subsequent snapshots', () => {
    recordDedupeEvent({ key: 'inbox:a', reason: 'memory_cache' });
    const snap1 = getDedupeTelemetrySnapshot();
    snap1.byReason.memory_cache = 999;
    const snap2 = getDedupeTelemetrySnapshot();
    expect(snap2.byReason.memory_cache).toBe(1);
  });
});
