/**
 * Tests for whatsappConnectionsCache.ts
 *
 * Covered behaviors:
 *  - cache miss → DB fetch
 *  - cache hit within TTL
 *  - TTL expiry forces re-fetch
 *  - force=true bypasses live cache
 *  - in-flight deduplication (thundering-herd protection)
 *  - DB error propagation (no caching on error)
 *  - invalidateWhatsappConnectionsCache resets state
 *  - getWhatsappConnectionById: find by id, null on miss, force flag
 *  - getFirstConnectedWhatsapp: filter by 'connected', sort by updated_at desc, null handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the Supabase chain ───────────────────────────────────────────────────
// fetchFromDb() calls: supabase.from(...).select(...).order(...)
// The terminal callable is order(), which returns Promise<{data, error}>.
const mockOrder = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    from: () => ({
      select: () => ({
        order: mockOrder,
      }),
    }),
  },
}));

import {
  getWhatsappConnections,
  invalidateWhatsappConnectionsCache,
  getWhatsappConnectionById,
  getFirstConnectedWhatsapp,
  type WhatsappConnectionRow,
} from '../whatsappConnectionsCache';

// ── helpers ───────────────────────────────────────────────────────────────────

function dbResult(data: unknown, error: unknown = null) {
  return Promise.resolve({ data, error });
}

function makeRow(overrides: Partial<WhatsappConnectionRow> = {}): WhatsappConnectionRow {
  return {
    id: 'row-1',
    instance_id: 'inst-1',
    instance_name: 'my-instance',
    phone_number: '+55999999999',
    status: 'connected',
    api_type: 'evolution',
    updated_at: '2026-01-01T12:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockOrder.mockReset();
  invalidateWhatsappConnectionsCache(); // reset module-level cache state
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── cache miss → DB fetch ─────────────────────────────────────────────────────

describe('getWhatsappConnections — cache miss', () => {
  it('fetches from DB on first call and returns rows', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getWhatsappConnections();
    expect(result).toEqual(rows);
    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when DB data is null', async () => {
    mockOrder.mockReturnValueOnce(dbResult(null));
    const result = await getWhatsappConnections();
    expect(result).toEqual([]);
  });

  it('returns empty array when DB data is an empty array', async () => {
    mockOrder.mockReturnValueOnce(dbResult([]));
    const result = await getWhatsappConnections();
    expect(result).toEqual([]);
  });

  it('returns multiple rows correctly', async () => {
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' }), makeRow({ id: 'c' })];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getWhatsappConnections();
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

// ── cache hit ─────────────────────────────────────────────────────────────────

describe('getWhatsappConnections — cache hit', () => {
  it('returns cached rows on second call without extra DB fetch', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    await getWhatsappConnections(); // primes cache
    const result = await getWhatsappConnections(); // hits cache

    expect(result).toEqual(rows);
    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('cache serves multiple consecutive calls from the same fetch', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    await getWhatsappConnections();
    await getWhatsappConnections();
    await getWhatsappConnections();

    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('serves cache just before TTL expires (at 29 999 ms)', async () => {
    const rows = [makeRow({ id: 'original' })];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    await getWhatsappConnections();
    vi.advanceTimersByTime(29_999);

    const result = await getWhatsappConnections();
    expect(result[0].id).toBe('original');
    expect(mockOrder).toHaveBeenCalledTimes(1);
  });
});

// ── TTL expiry ────────────────────────────────────────────────────────────────

describe('getWhatsappConnections — TTL expiry', () => {
  it('re-fetches after 30 001 ms (past the 30s TTL)', async () => {
    const oldRows = [makeRow({ id: 'old' })];
    const newRows = [makeRow({ id: 'new' })];
    mockOrder
      .mockReturnValueOnce(dbResult(oldRows))
      .mockReturnValueOnce(dbResult(newRows));

    await getWhatsappConnections();
    vi.advanceTimersByTime(30_001);

    const result = await getWhatsappConnections();
    expect(result[0].id).toBe('new');
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });

  it('re-fetches at exactly the TTL boundary (expiresAt > now is false when equal)', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValue(dbResult(rows));

    await getWhatsappConnections();
    vi.advanceTimersByTime(30_000); // strict > fails: 30000 > 30000 is false

    await getWhatsappConnections();
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });

  it('serves fresh cache between re-fetches without extra DB calls', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValue(dbResult(rows));

    await getWhatsappConnections();
    vi.advanceTimersByTime(30_001); // expire

    await getWhatsappConnections(); // re-fetch
    await getWhatsappConnections(); // hits new cache

    expect(mockOrder).toHaveBeenCalledTimes(2);
  });
});

// ── force bypass ──────────────────────────────────────────────────────────────

describe('getWhatsappConnections — force bypass', () => {
  it('force=true skips cache and re-fetches from DB', async () => {
    const first = [makeRow({ id: 'first' })];
    const second = [makeRow({ id: 'second' })];
    mockOrder
      .mockReturnValueOnce(dbResult(first))
      .mockReturnValueOnce(dbResult(second));

    await getWhatsappConnections();
    const result = await getWhatsappConnections(true);

    expect(result[0].id).toBe('second');
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });

  it('force refresh populates cache for subsequent non-force calls', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    await getWhatsappConnections(true); // force populates cache
    await getWhatsappConnections(); // should use cache set by force call

    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('force=false (default) uses cache when valid', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    await getWhatsappConnections(false);
    await getWhatsappConnections(false);

    expect(mockOrder).toHaveBeenCalledTimes(1);
  });
});

// ── in-flight deduplication ───────────────────────────────────────────────────

describe('getWhatsappConnections — in-flight deduplication', () => {
  it('coalesces two concurrent callers into one DB fetch', async () => {
    let resolveOrder!: (val: { data: WhatsappConnectionRow[]; error: null }) => void;
    const pending = new Promise<{ data: WhatsappConnectionRow[]; error: null }>((res) => {
      resolveOrder = res;
    });
    mockOrder.mockReturnValueOnce(pending);

    const p1 = getWhatsappConnections();
    const p2 = getWhatsappConnections();

    resolveOrder({ data: [makeRow()], error: null });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('both concurrent callers receive the same data', async () => {
    let resolveOrder!: (val: { data: WhatsappConnectionRow[]; error: null }) => void;
    const pending = new Promise<{ data: WhatsappConnectionRow[]; error: null }>((res) => {
      resolveOrder = res;
    });
    mockOrder.mockReturnValueOnce(pending);

    const p1 = getWhatsappConnections();
    const p2 = getWhatsappConnections();

    const sharedRow = makeRow({ id: 'shared' });
    resolveOrder({ data: [sharedRow], error: null });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1[0].id).toBe('shared');
    expect(r2[0].id).toBe('shared');
  });

  it('inflight slot is cleared after resolution, enabling a fresh fetch later', async () => {
    const rows = [makeRow()];
    mockOrder.mockReturnValue(dbResult(rows));

    await getWhatsappConnections(); // completes: inflight resets to null
    invalidateWhatsappConnectionsCache();
    await getWhatsappConnections(); // must start a new fetch (inflight is null)

    expect(mockOrder).toHaveBeenCalledTimes(2);
  });
});

// ── DB error propagation ──────────────────────────────────────────────────────

describe('getWhatsappConnections — DB error propagation', () => {
  it('propagates supabase error to the caller', async () => {
    mockOrder.mockReturnValueOnce(dbResult(null, { message: 'connection refused', code: '500' }));
    await expect(getWhatsappConnections()).rejects.toMatchObject({ message: 'connection refused' });
  });

  it('does not cache on DB error — next call retries DB', async () => {
    const rows = [makeRow()];
    mockOrder
      .mockReturnValueOnce(dbResult(null, { message: 'DB down' }))
      .mockReturnValueOnce(dbResult(rows));

    await expect(getWhatsappConnections()).rejects.toBeDefined();
    const result = await getWhatsappConnections();
    expect(result).toEqual(rows);
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });

  it('inflight is cleared after a DB error (no stuck in-flight state)', async () => {
    const rows = [makeRow()];
    mockOrder
      .mockReturnValueOnce(dbResult(null, { message: 'timeout' }))
      .mockReturnValueOnce(dbResult(rows));

    await expect(getWhatsappConnections()).rejects.toBeDefined();
    // A second caller should trigger a fresh fetch (not re-use failed inflight)
    const result = await getWhatsappConnections();
    expect(result).toHaveLength(1);
  });
});

// ── invalidateWhatsappConnectionsCache ───────────────────────────────────────

describe('invalidateWhatsappConnectionsCache', () => {
  it('forces re-fetch on next call after invalidation', async () => {
    const before = [makeRow({ id: 'before' })];
    const after = [makeRow({ id: 'after' })];
    mockOrder
      .mockReturnValueOnce(dbResult(before))
      .mockReturnValueOnce(dbResult(after));

    await getWhatsappConnections();
    invalidateWhatsappConnectionsCache();
    const result = await getWhatsappConnections();

    expect(result[0].id).toBe('after');
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });

  it('is idempotent — multiple invalidations do not cause errors', async () => {
    invalidateWhatsappConnectionsCache();
    invalidateWhatsappConnectionsCache();

    const rows = [makeRow()];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getWhatsappConnections();
    expect(result).toEqual(rows);
  });

  it('can be called before any fetch without error', () => {
    expect(() => invalidateWhatsappConnectionsCache()).not.toThrow();
  });
});

// ── getWhatsappConnectionById ────────────────────────────────────────────────

describe('getWhatsappConnectionById', () => {
  it('returns the row matching the given id', async () => {
    const rows = [makeRow({ id: 'abc' }), makeRow({ id: 'xyz' })];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    const result = await getWhatsappConnectionById('abc');
    expect(result?.id).toBe('abc');
  });

  it('returns null when id is not present in the list', async () => {
    mockOrder.mockReturnValueOnce(dbResult([makeRow({ id: 'other' })]));
    const result = await getWhatsappConnectionById('missing');
    expect(result).toBeNull();
  });

  it('returns null when connection list is empty', async () => {
    mockOrder.mockReturnValueOnce(dbResult([]));
    const result = await getWhatsappConnectionById('any-id');
    expect(result).toBeNull();
  });

  it('returns full row data (not just id)', async () => {
    const row = makeRow({ id: 'full', phone_number: '+5511999990000', status: 'connected' });
    mockOrder.mockReturnValueOnce(dbResult([row]));

    const result = await getWhatsappConnectionById('full');
    expect(result?.phone_number).toBe('+5511999990000');
    expect(result?.status).toBe('connected');
  });

  it('finds first match when multiple rows have the same id (defensive)', async () => {
    const rows = [makeRow({ id: 'dup', status: 'connected' }), makeRow({ id: 'dup', status: 'disconnected' })];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getWhatsappConnectionById('dup');
    expect(result?.status).toBe('connected'); // first match wins
  });

  it('uses cached data for subsequent calls without force', async () => {
    const rows = [makeRow({ id: 'abc' })];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    await getWhatsappConnectionById('abc');
    await getWhatsappConnectionById('abc');

    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('passes force=true through to getWhatsappConnections', async () => {
    const stale = [makeRow({ id: 'stale-conn', status: 'connected' })];
    const fresh = [makeRow({ id: 'fresh-conn', status: 'connected' })];
    mockOrder
      .mockReturnValueOnce(dbResult(stale))
      .mockReturnValueOnce(dbResult(fresh));

    await getWhatsappConnectionById('stale-conn'); // primes cache
    const result = await getWhatsappConnectionById('fresh-conn', true); // force re-fetch

    expect(result?.id).toBe('fresh-conn');
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });
});

// ── getFirstConnectedWhatsapp ─────────────────────────────────────────────────

describe('getFirstConnectedWhatsapp', () => {
  it('returns null when connection list is empty', async () => {
    mockOrder.mockReturnValueOnce(dbResult([]));
    const result = await getFirstConnectedWhatsapp();
    expect(result).toBeNull();
  });

  it('returns null when no row has status "connected"', async () => {
    const rows = [
      makeRow({ id: 'a', status: 'disconnected' }),
      makeRow({ id: 'b', status: 'connecting' }),
      makeRow({ id: 'c', status: null }),
    ];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getFirstConnectedWhatsapp();
    expect(result).toBeNull();
  });

  it('returns the single connected row', async () => {
    const rows = [
      makeRow({ id: 'disc', status: 'disconnected' }),
      makeRow({ id: 'conn', status: 'connected' }),
    ];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getFirstConnectedWhatsapp();
    expect(result?.id).toBe('conn');
  });

  it('returns the most recently updated connected row (sort by updated_at desc)', async () => {
    const rows = [
      makeRow({ id: 'older', status: 'connected', updated_at: '2026-01-01T10:00:00Z' }),
      makeRow({ id: 'newest', status: 'connected', updated_at: '2026-01-03T10:00:00Z' }),
      makeRow({ id: 'middle', status: 'connected', updated_at: '2026-01-02T10:00:00Z' }),
    ];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getFirstConnectedWhatsapp();
    expect(result?.id).toBe('newest');
  });

  it('ignores disconnected rows even when they have a newer updated_at', async () => {
    const rows = [
      makeRow({ id: 'disc-new', status: 'disconnected', updated_at: '2026-06-01T00:00:00Z' }),
      makeRow({ id: 'conn-old', status: 'connected', updated_at: '2025-01-01T00:00:00Z' }),
    ];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getFirstConnectedWhatsapp();
    expect(result?.id).toBe('conn-old');
  });

  it('handles null updated_at by treating it as empty string (sorts last)', async () => {
    const rows = [
      makeRow({ id: 'no-date', status: 'connected', updated_at: null }),
      makeRow({ id: 'with-date', status: 'connected', updated_at: '2026-01-01T00:00:00Z' }),
    ];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getFirstConnectedWhatsapp();
    expect(result?.id).toBe('with-date'); // date string sorts before '' (null)
  });

  it('when all connected rows have null updated_at, returns any connected row', async () => {
    const rows = [
      makeRow({ id: 'conn-a', status: 'connected', updated_at: null }),
      makeRow({ id: 'conn-b', status: 'connected', updated_at: null }),
    ];
    mockOrder.mockReturnValueOnce(dbResult(rows));
    const result = await getFirstConnectedWhatsapp();
    expect(result?.status).toBe('connected'); // either is acceptable
  });

  it('uses cached data for subsequent calls without force', async () => {
    const rows = [makeRow({ status: 'connected' })];
    mockOrder.mockReturnValueOnce(dbResult(rows));

    await getFirstConnectedWhatsapp();
    await getFirstConnectedWhatsapp();

    expect(mockOrder).toHaveBeenCalledTimes(1);
  });

  it('passes force=true through to getWhatsappConnections', async () => {
    const stale = [makeRow({ id: 'stale', status: 'connected', updated_at: '2025-01-01T00:00:00Z' })];
    const fresh = [makeRow({ id: 'fresh', status: 'connected', updated_at: '2026-06-01T00:00:00Z' })];
    mockOrder
      .mockReturnValueOnce(dbResult(stale))
      .mockReturnValueOnce(dbResult(fresh));

    await getFirstConnectedWhatsapp();
    const result = await getFirstConnectedWhatsapp(true);

    expect(result?.id).toBe('fresh');
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });

  it('returns full row data (not just id)', async () => {
    const row = makeRow({
      id: 'detail-test',
      status: 'connected',
      phone_number: '+5511888880000',
      instance_name: 'test-inst',
    });
    mockOrder.mockReturnValueOnce(dbResult([row]));

    const result = await getFirstConnectedWhatsapp();
    expect(result?.phone_number).toBe('+5511888880000');
    expect(result?.instance_name).toBe('test-inst');
  });
});
