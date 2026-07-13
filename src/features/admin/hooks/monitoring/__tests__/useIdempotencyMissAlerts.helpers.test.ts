/**
 * Tests for the pure helpers exposed through the __test__ export of
 * useIdempotencyMissAlerts.ts.
 *
 * These helpers drive the per-instance, per-hour-bucket deduplication of
 * "idempotency miss" admin alerts. They were deliberately marked for testing
 * (via the `__test__` named export) but no test file was ever written.
 *
 * Helpers under test:
 *   hourBucket(ts)             — truncates a Unix ms timestamp to an hourly integer bucket
 *   buildPersistKey(inst, ts)  — builds a stable localStorage key from instance + bucket
 *   loadPersistedAlerts()      — deserialises a TTL-filtered Map from localStorage
 *   savePersistedAlerts(map)   — serialises a TTL-filtered Map to localStorage
 *
 * The hook itself (useIdempotencyMissAlerts) is NOT tested here — it requires
 * React Query, Supabase, and useUserRole.
 *
 * localStorage is provided by happy-dom (no stub needed); it is cleared before
 * every test to prevent state leakage.
 *
 * Covered:
 *   constants:
 *     - ALERT_DEDUPE_STORAGE_KEY matches expected key
 *     - ONE_HOUR_MS equals 3 600 000
 *     - PERSIST_TTL_MS equals 6 × ONE_HOUR_MS
 *   hourBucket:
 *     - ts=0 → bucket 0
 *     - ts=ONE_HOUR_MS-1 → still bucket 0 (within first hour)
 *     - ts=ONE_HOUR_MS → bucket 1 (second hour starts)
 *     - ts=ONE_HOUR_MS+1 → still bucket 1
 *     - all timestamps in the same wall-clock hour share one bucket
 *     - consecutive hours produce consecutive bucket integers
 *   buildPersistKey:
 *     - returns a string starting with "idempotency-miss:"
 *     - embeds the instance name
 *     - embeds the hourBucket of the timestamp
 *     - same instance × same hour → identical key
 *     - same instance × different hour → different key
 *     - different instance × same hour → different key
 *   loadPersistedAlerts:
 *     - empty localStorage → empty Map
 *     - missing key → empty Map
 *     - malformed JSON → empty Map (no throw)
 *     - non-expired entries are loaded
 *     - expired entries (older than PERSIST_TTL_MS) are filtered out
 *   savePersistedAlerts / loadPersistedAlerts roundtrip:
 *     - save then load returns the same keys and timestamps
 *     - expired entries are excluded from the save
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { __test__ } from '../useIdempotencyMissAlerts';

const {
  ALERT_DEDUPE_STORAGE_KEY,
  ONE_HOUR_MS,
  PERSIST_TTL_MS,
  hourBucket,
  buildPersistKey,
  loadPersistedAlerts,
  savePersistedAlerts,
} = __test__;

beforeEach(() => {
  localStorage.clear();
});

// ── constants ─────────────────────────────────────────────────────────────────
describe('useIdempotencyMissAlerts.__test__ — constants', () => {
  it('ALERT_DEDUPE_STORAGE_KEY is "zapp:idempotency-miss-alerts:v1"', () => {
    expect(ALERT_DEDUPE_STORAGE_KEY).toBe('zapp:idempotency-miss-alerts:v1');
  });

  it('ONE_HOUR_MS equals 3 600 000', () => {
    expect(ONE_HOUR_MS).toBe(3_600_000);
  });

  it('PERSIST_TTL_MS equals 6 hours in milliseconds', () => {
    expect(PERSIST_TTL_MS).toBe(6 * ONE_HOUR_MS);
  });
});

// ── hourBucket ────────────────────────────────────────────────────────────────
describe('useIdempotencyMissAlerts.__test__ — hourBucket', () => {
  it('ts=0 → bucket 0', () => {
    expect(hourBucket(0)).toBe(0);
  });

  it('ts=ONE_HOUR_MS-1 stays in bucket 0 (last ms of first hour)', () => {
    expect(hourBucket(ONE_HOUR_MS - 1)).toBe(0);
  });

  it('ts=ONE_HOUR_MS → bucket 1 (first ms of second hour)', () => {
    expect(hourBucket(ONE_HOUR_MS)).toBe(1);
  });

  it('ts=ONE_HOUR_MS+1 stays in bucket 1', () => {
    expect(hourBucket(ONE_HOUR_MS + 1)).toBe(1);
  });

  it('two timestamps one ms apart within the same hour share one bucket', () => {
    const base = ONE_HOUR_MS * 100; // arbitrary hour boundary
    expect(hourBucket(base)).toBe(hourBucket(base + ONE_HOUR_MS - 1));
  });

  it('consecutive hours produce consecutive bucket integers', () => {
    const b1 = hourBucket(ONE_HOUR_MS * 10);
    const b2 = hourBucket(ONE_HOUR_MS * 11);
    expect(b2 - b1).toBe(1);
  });

  it('hourBucket is an integer (no fractional part)', () => {
    const result = hourBucket(ONE_HOUR_MS * 5 + 999);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ── buildPersistKey ───────────────────────────────────────────────────────────
describe('useIdempotencyMissAlerts.__test__ — buildPersistKey', () => {
  it('starts with "idempotency-miss:"', () => {
    const key = buildPersistKey('inst-1', 0);
    expect(key.startsWith('idempotency-miss:')).toBe(true);
  });

  it('embeds the instance name in the key', () => {
    const key = buildPersistKey('my-whatsapp', ONE_HOUR_MS);
    expect(key).toContain('my-whatsapp');
  });

  it('embeds the hourBucket of the timestamp', () => {
    const ts = ONE_HOUR_MS * 42;
    const key = buildPersistKey('inst', ts);
    const bucket = hourBucket(ts);
    expect(key.endsWith(`:${bucket}`)).toBe(true);
  });

  it('same instance × same hour → identical key', () => {
    const ts = ONE_HOUR_MS * 7;
    expect(buildPersistKey('inst-A', ts)).toBe(buildPersistKey('inst-A', ts + 1000));
  });

  it('same instance × different hour → different key', () => {
    const h1 = ONE_HOUR_MS * 7;
    const h2 = ONE_HOUR_MS * 8;
    expect(buildPersistKey('inst-A', h1)).not.toBe(buildPersistKey('inst-A', h2));
  });

  it('different instance × same hour → different key', () => {
    const ts = ONE_HOUR_MS * 7;
    expect(buildPersistKey('inst-A', ts)).not.toBe(buildPersistKey('inst-B', ts));
  });
});

// ── loadPersistedAlerts — empty / missing ─────────────────────────────────────
describe('useIdempotencyMissAlerts.__test__ — loadPersistedAlerts (empty storage)', () => {
  it('returns an empty Map when localStorage is empty', () => {
    const map = loadPersistedAlerts();
    expect(map.size).toBe(0);
  });

  it('returns an empty Map when the key is missing', () => {
    localStorage.setItem('some-other-key', '{}');
    const map = loadPersistedAlerts();
    expect(map.size).toBe(0);
  });

  it('returns an empty Map for malformed JSON without throwing', () => {
    localStorage.setItem(ALERT_DEDUPE_STORAGE_KEY, '{not valid json');
    expect(() => loadPersistedAlerts()).not.toThrow();
    expect(loadPersistedAlerts().size).toBe(0);
  });

  it('returns an empty Map when the stored value is null', () => {
    localStorage.setItem(ALERT_DEDUPE_STORAGE_KEY, 'null');
    const map = loadPersistedAlerts();
    expect(map.size).toBe(0);
  });
});

// ── loadPersistedAlerts — TTL filtering ───────────────────────────────────────
describe('useIdempotencyMissAlerts.__test__ — loadPersistedAlerts (TTL filtering)', () => {
  it('loads a non-expired entry', () => {
    const freshTs = Date.now();
    const data = { 'key-fresh': freshTs };
    localStorage.setItem(ALERT_DEDUPE_STORAGE_KEY, JSON.stringify(data));
    const map = loadPersistedAlerts();
    expect(map.has('key-fresh')).toBe(true);
    expect(map.get('key-fresh')).toBe(freshTs);
  });

  it('excludes an expired entry (older than PERSIST_TTL_MS)', () => {
    const expiredTs = Date.now() - PERSIST_TTL_MS - 5_000;
    const data = { 'key-expired': expiredTs };
    localStorage.setItem(ALERT_DEDUPE_STORAGE_KEY, JSON.stringify(data));
    const map = loadPersistedAlerts();
    expect(map.has('key-expired')).toBe(false);
  });

  it('keeps fresh entries while discarding expired ones in the same payload', () => {
    const freshTs = Date.now();
    const expiredTs = Date.now() - PERSIST_TTL_MS - 5_000;
    const data = { 'key-fresh': freshTs, 'key-expired': expiredTs };
    localStorage.setItem(ALERT_DEDUPE_STORAGE_KEY, JSON.stringify(data));
    const map = loadPersistedAlerts();
    expect(map.has('key-fresh')).toBe(true);
    expect(map.has('key-expired')).toBe(false);
    expect(map.size).toBe(1);
  });
});

// ── savePersistedAlerts / loadPersistedAlerts roundtrip ───────────────────────
describe('useIdempotencyMissAlerts.__test__ — save/load roundtrip', () => {
  it('saves entries and loads them back correctly', () => {
    const ts = Date.now();
    const original = new Map<string, number>([
      ['key-a', ts],
      ['key-b', ts - 100],
    ]);
    savePersistedAlerts(original);
    const loaded = loadPersistedAlerts();
    expect(loaded.has('key-a')).toBe(true);
    expect(loaded.has('key-b')).toBe(true);
    expect(loaded.get('key-a')).toBe(ts);
  });

  it('save excludes expired entries from the persisted payload', () => {
    const freshTs = Date.now();
    const expiredTs = Date.now() - PERSIST_TTL_MS - 5_000;
    const map = new Map<string, number>([
      ['key-fresh', freshTs],
      ['key-expired', expiredTs],
    ]);
    savePersistedAlerts(map);
    const raw = localStorage.getItem(ALERT_DEDUPE_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect('key-fresh' in parsed).toBe(true);
    expect('key-expired' in parsed).toBe(false);
  });

  it('load after save with only expired entries → empty Map', () => {
    const expiredTs = Date.now() - PERSIST_TTL_MS - 5_000;
    const map = new Map<string, number>([['key-expired', expiredTs]]);
    savePersistedAlerts(map);
    const loaded = loadPersistedAlerts();
    expect(loaded.size).toBe(0);
  });

  it('save writes to the expected localStorage key', () => {
    const map = new Map<string, number>([['k', Date.now()]]);
    savePersistedAlerts(map);
    expect(localStorage.getItem(ALERT_DEDUPE_STORAGE_KEY)).not.toBeNull();
  });
});
