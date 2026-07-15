// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LS_PREFIX,
  __TAB_ID,
  gcExpiredKeys,
  clearCrossTabDedupe,
  dedupedFetch,
  subscribeDedupe,
  __notifyLocal,
} from '../crossTabDedupe';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/realtime/dedupeTelemetry', () => ({
  recordDedupeEvent: vi.fn(),
}));

const LS_LOCK_PREFIX = 'ctd:lock:';
const LS_RESULT_PREFIX = 'ctd:result:';
const LS_BUS_PREFIX = 'ctd:bus:';

function writeLock(key: string, expiresAt = Date.now() + 10_000, ownerId = 'other-tab') {
  localStorage.setItem(
    LS_LOCK_PREFIX + key,
    JSON.stringify({ ownerId, acquiredAt: Date.now(), expiresAt }),
  );
}

function writeCachedResult(key: string, value: unknown, expiresAt = Date.now() + 30_000) {
  localStorage.setItem(LS_RESULT_PREFIX + key, JSON.stringify({ value, expiresAt }));
}

function writeBusEntry(key: string, ts: number) {
  localStorage.setItem(LS_BUS_PREFIX + key, JSON.stringify({ ts, type: 'result' }));
}

beforeEach(() => {
  clearCrossTabDedupe();
  localStorage.clear();
});

// ── constants ─────────────────────────────────────────────────────────────────

describe('crossTabDedupe — constants', () => {
  it('LS_PREFIX equals "ctd:lock:"', () => {
    expect(LS_PREFIX).toBe('ctd:lock:');
  });

  it('__TAB_ID is a non-empty string', () => {
    expect(typeof __TAB_ID).toBe('string');
    expect(__TAB_ID.length).toBeGreaterThan(0);
  });

  it('__TAB_ID matches expected pattern (alphanumeric/dashes)', () => {
    expect(__TAB_ID).toMatch(/^[a-z0-9-]+$/i);
  });
});

// ── gcExpiredKeys — empty / non-ctd ──────────────────────────────────────────

describe('gcExpiredKeys — empty localStorage', () => {
  it('returns zeros when localStorage is empty', () => {
    const result = gcExpiredKeys();
    expect(result.locksSwept).toBe(0);
    expect(result.resultsSwept).toBe(0);
  });

  it('returns zeros when only non-ctd keys exist', () => {
    localStorage.setItem('some:other:key', 'value');
    localStorage.setItem('app:settings', '{}');
    const result = gcExpiredKeys();
    expect(result.locksSwept).toBe(0);
    expect(result.resultsSwept).toBe(0);
  });
});

// ── gcExpiredKeys — locks ─────────────────────────────────────────────────────

describe('gcExpiredKeys — locks', () => {
  it('sweeps an expired lock and returns locksSwept: 1', () => {
    writeLock('my-key', Date.now() - 1);
    const result = gcExpiredKeys();
    expect(result.locksSwept).toBe(1);
    expect(localStorage.getItem(LS_LOCK_PREFIX + 'my-key')).toBeNull();
  });

  it('does not sweep a fresh lock', () => {
    writeLock('fresh-key', Date.now() + 10_000);
    const result = gcExpiredKeys();
    expect(result.locksSwept).toBe(0);
    expect(localStorage.getItem(LS_LOCK_PREFIX + 'fresh-key')).not.toBeNull();
  });

  it('sweeps multiple expired locks', () => {
    writeLock('key-a', Date.now() - 100);
    writeLock('key-b', Date.now() - 200);
    writeLock('key-c', Date.now() + 10_000);
    const result = gcExpiredKeys();
    expect(result.locksSwept).toBe(2);
    expect(localStorage.getItem(LS_LOCK_PREFIX + 'key-c')).not.toBeNull();
  });

  it('sweeps a lock with corrupted JSON (treats as expired)', () => {
    localStorage.setItem(LS_LOCK_PREFIX + 'bad-key', 'not-json{{{');
    const result = gcExpiredKeys();
    expect(result.locksSwept).toBeGreaterThanOrEqual(1);
  });
});

// ── gcExpiredKeys — results ───────────────────────────────────────────────────

describe('gcExpiredKeys — results', () => {
  it('sweeps an expired result', () => {
    writeCachedResult('stale-key', { data: 1 }, Date.now() - 1);
    const result = gcExpiredKeys();
    expect(result.resultsSwept).toBe(1);
    expect(localStorage.getItem(LS_RESULT_PREFIX + 'stale-key')).toBeNull();
  });

  it('does not sweep a fresh result', () => {
    writeCachedResult('fresh-key', { data: 2 }, Date.now() + 30_000);
    const result = gcExpiredKeys();
    expect(result.resultsSwept).toBe(0);
    expect(localStorage.getItem(LS_RESULT_PREFIX + 'fresh-key')).not.toBeNull();
  });
});

// ── gcExpiredKeys — bus ───────────────────────────────────────────────────────

describe('gcExpiredKeys — bus entries', () => {
  it('sweeps an old bus entry (older than 15 seconds)', () => {
    writeBusEntry('bus-key', Date.now() - 16_000);
    gcExpiredKeys();
    expect(localStorage.getItem(LS_BUS_PREFIX + 'bus-key')).toBeNull();
  });

  it('does not sweep a recent bus entry', () => {
    writeBusEntry('recent-bus', Date.now() - 1_000);
    gcExpiredKeys();
    expect(localStorage.getItem(LS_BUS_PREFIX + 'recent-bus')).not.toBeNull();
  });
});

// ── clearCrossTabDedupe ───────────────────────────────────────────────────────

describe('clearCrossTabDedupe', () => {
  it('removes ctd:lock: entries from localStorage', () => {
    writeLock('some-key');
    clearCrossTabDedupe();
    expect(localStorage.getItem(LS_LOCK_PREFIX + 'some-key')).toBeNull();
  });

  it('removes ctd:result: entries from localStorage', () => {
    writeCachedResult('some-key', { x: 1 });
    clearCrossTabDedupe();
    expect(localStorage.getItem(LS_RESULT_PREFIX + 'some-key')).toBeNull();
  });

  it('does not remove non-ctd entries from localStorage', () => {
    localStorage.setItem('app:theme', 'dark');
    localStorage.setItem('user:prefs', '{}');
    clearCrossTabDedupe();
    expect(localStorage.getItem('app:theme')).toBe('dark');
    expect(localStorage.getItem('user:prefs')).toBe('{}');
  });

  it('is safe to call multiple times in a row', () => {
    writeLock('key');
    expect(() => {
      clearCrossTabDedupe();
      clearCrossTabDedupe();
      clearCrossTabDedupe();
    }).not.toThrow();
  });
});

// ── subscribeDedupe — string matcher ─────────────────────────────────────────

describe('subscribeDedupe — string matcher', () => {
  it('calls handler on exact key match', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe('my-key', handler);
    __notifyLocal('my-key', { result: 42 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('my-key', { result: 42 }, 'local');
    unsub();
  });

  it('calls handler when key starts with the matcher string (prefix)', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe('prefix:', handler);
    __notifyLocal('prefix:some-sub-key', { val: 1 });
    expect(handler).toHaveBeenCalledOnce();
    unsub();
  });

  it('does not call handler when key does not match', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe('other-key', handler);
    __notifyLocal('my-key', { result: 42 });
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });
});

// ── subscribeDedupe — RegExp matcher ─────────────────────────────────────────

describe('subscribeDedupe — RegExp matcher', () => {
  it('calls handler when key matches the RegExp', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe(/^user:\d+$/, handler);
    __notifyLocal('user:123', { name: 'Alice' });
    expect(handler).toHaveBeenCalledOnce();
    unsub();
  });

  it('does not call handler when key does not match the RegExp', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe(/^user:\d+$/, handler);
    __notifyLocal('user:abc', { name: 'Bob' });
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });
});

// ── subscribeDedupe — multiple subscribers ────────────────────────────────────

describe('subscribeDedupe — multiple subscribers', () => {
  it('all matching subscribers receive the notification', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = subscribeDedupe('shared-key', h1);
    const unsub2 = subscribeDedupe('shared-key', h2);
    __notifyLocal('shared-key', { ok: true });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    unsub1();
    unsub2();
  });

  it('unsubscribed handler no longer receives notifications', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe('my-key', handler);
    unsub();
    __notifyLocal('my-key', { val: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribing one does not affect other subscribers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = subscribeDedupe('shared-key', h1);
    const unsub2 = subscribeDedupe('shared-key', h2);
    unsub1();
    __notifyLocal('shared-key', { data: 99 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
    unsub2();
  });

  it('throwing handler does not prevent other handlers from running', () => {
    const throwing = vi.fn().mockImplementation(() => {
      throw new Error('handler error');
    });
    const safe = vi.fn();
    const unsub1 = subscribeDedupe('key', throwing);
    const unsub2 = subscribeDedupe('key', safe);
    expect(() => __notifyLocal('key', {})).not.toThrow();
    expect(safe).toHaveBeenCalledOnce();
    unsub1();
    unsub2();
  });
});

// ── __notifyLocal ─────────────────────────────────────────────────────────────

describe('__notifyLocal', () => {
  it('passes data through to the subscriber', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe('data-key', handler);
    const payload = { items: [1, 2, 3], total: 3 };
    __notifyLocal('data-key', payload);
    expect(handler).toHaveBeenCalledWith('data-key', payload, 'local');
    unsub();
  });

  it('passes source="local" to the subscriber', () => {
    const handler = vi.fn();
    const unsub = subscribeDedupe('source-key', handler);
    __notifyLocal('source-key', null);
    const [, , source] = handler.mock.calls[0];
    expect(source).toBe('local');
    unsub();
  });
});

// ── dedupedFetch — memory cache ───────────────────────────────────────────────

describe('dedupedFetch — memory cache', () => {
  it('calls the fetcher exactly once for repeated calls', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'hello' });
    await dedupedFetch('cache-key', fetcher);
    await dedupedFetch('cache-key', fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('returns cached value on second call', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'world' });
    const first = await dedupedFetch('val-key', fetcher);
    const second = await dedupedFetch('val-key', fetcher);
    expect(first).toEqual({ data: 'world' });
    expect(second).toEqual({ data: 'world' });
  });

  it('propagates fetcher errors to the caller', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(dedupedFetch('err-key', fetcher)).rejects.toThrow('network error');
  });
});

// ── dedupedFetch — persisted LS cache ────────────────────────────────────────

describe('dedupedFetch — persisted localStorage cache', () => {
  it('returns the pre-cached LS result without calling the fetcher', async () => {
    writeCachedResult('ls-key', { cached: true });
    const fetcher = vi.fn().mockResolvedValue({ cached: false });
    const result = await dedupedFetch('ls-key', fetcher);
    expect(result).toEqual({ cached: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls the fetcher when the LS result is expired', async () => {
    writeCachedResult('expired-key', { stale: true }, Date.now() - 1);
    const fetcher = vi.fn().mockResolvedValue({ fresh: true });
    const result = await dedupedFetch('expired-key', fetcher);
    expect(result).toEqual({ fresh: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

// ── dedupedFetch — inflight dedup ─────────────────────────────────────────────

describe('dedupedFetch — inflight deduplication', () => {
  it('concurrent calls to the same key share a single fetcher invocation', async () => {
    let resolve!: (v: unknown) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));

    const p1 = dedupedFetch('inflight-key', fetcher);
    const p2 = dedupedFetch('inflight-key', fetcher);
    resolve({ value: 1 });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(r1).toEqual({ value: 1 });
    expect(r2).toEqual({ value: 1 });
  });

  it('different keys do not share a fetcher invocation', async () => {
    const fetcherA = vi.fn().mockResolvedValue('a');
    const fetcherB = vi.fn().mockResolvedValue('b');
    await Promise.all([
      dedupedFetch('key-a', fetcherA),
      dedupedFetch('key-b', fetcherB),
    ]);
    expect(fetcherA).toHaveBeenCalledOnce();
    expect(fetcherB).toHaveBeenCalledOnce();
  });
});

// ── dedupedFetch — after clear ────────────────────────────────────────────────

describe('dedupedFetch — after clearCrossTabDedupe', () => {
  it('re-invokes the fetcher after cache is cleared', async () => {
    const fetcher = vi.fn().mockResolvedValue({ val: 1 });
    await dedupedFetch('clear-key', fetcher);
    clearCrossTabDedupe();
    localStorage.clear();
    await dedupedFetch('clear-key', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
