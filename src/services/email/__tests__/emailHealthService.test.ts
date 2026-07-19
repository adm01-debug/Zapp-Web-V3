/**
 * Tests for EmailHealthService — the pure / deterministic methods that contain
 * all branching logic and need no network, Supabase, or React.
 *
 * Two method groups are tested:
 *
 *   calculateStatus(failures)
 *     Maps a failure array to one of 'healthy' | 'degraded' | 'error'.
 *     Branching rules:
 *       - non-array input (null, undefined, object) → 'error'
 *       - array length === 0 → 'healthy'
 *       - array length 1–10 → 'degraded'
 *       - array length > 10 → 'error'
 *
 *   getFailures(filters)
 *     Filters a pre-loaded failure list by requestId, operation, and resource,
 *     then paginates.  The repository is replaced with a minimal stub that
 *     returns a known failure set.
 *     Branching rules:
 *       - no filters → returns all entries (up to pageSize)
 *       - requestId substring filter (case-sensitive)
 *       - operation exact match (case-insensitive)
 *       - resource substring match (case-insensitive)
 *       - pagination: page/pageSize slice
 *       - total reflects the count BEFORE pagination
 *       - null/undefined recentFailures → treated as []
 *
 * No mocks needed for calculateStatus (pure function).
 * getFailures uses a hand-built stub repository — no vi.mock() required.
 *
 * Covered:
 *   calculateStatus
 *     - null → 'error'
 *     - undefined → 'error'
 *     - non-array object → 'error'
 *     - empty array → 'healthy'
 *     - array with 1 failure → 'degraded'
 *     - array with 10 failures → 'degraded' (boundary: still ≤ 10)
 *     - array with 11 failures → 'error'  (boundary: > 10)
 *     - large array (50 failures) → 'error'
 *   getFailures — no filters
 *     - returns all items when no filters are applied
 *   getFailures — requestId filter
 *     - matches by substring
 *     - is case-sensitive (requestId is an ID, not a label)
 *     - non-matching filter → empty items, total = 0
 *   getFailures — operation filter
 *     - exact match, case-insensitive
 *     - non-matching operation → empty items
 *   getFailures — resource filter
 *     - substring match, case-insensitive
 *     - non-matching resource → empty items
 *   getFailures — pagination
 *     - default page=1, pageSize=10
 *     - page 2 returns second slice
 *     - total always reflects the unfiltered+filtered count
 *   getFailures — null recentFailures
 *     - treats null failures as empty list → items: [], total: 0
 */
import { describe, it, expect } from 'vitest';
import { EmailHealthService } from '../emailHealthService';
import type { EmailFailure } from '../types';

// ── stub repository ───────────────────────────────────────────────────────────

function makeRepo(failures: EmailFailure[] | null = []) {
  return {
    getRemoteSummary: async () => null,
    getLocalTelemetry: () => ({
      lastValidation: null,
      recentFailures: failures,
      stats: { totalCalls: 0, failedCalls: 0, cacheHits: 0 },
    }),
    getLocalCacheInfo: () => ({ expiration: null, size: 0 }),
    forceRevalidation: async () => {},
  } as unknown as ConstructorParameters<typeof EmailHealthService>[0];
}

function makeService(failures: EmailFailure[] | null = []) {
  return new EmailHealthService(makeRepo(failures));
}

// ── failure factory ───────────────────────────────────────────────────────────

let _id = 0;
function makeFailure(overrides: Partial<EmailFailure> = {}): EmailFailure {
  _id++;
  return {
    requestId: `req-${_id}`,
    operation: 'fetch',
    resource: 'email_threads',
    error: 'Timeout',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeFailures(n: number, overrides?: Partial<EmailFailure>): EmailFailure[] {
  return Array.from({ length: n }, () => makeFailure(overrides));
}

// ── calculateStatus ───────────────────────────────────────────────────────────

describe('calculateStatus — non-array inputs → "error"', () => {
  const svc = makeService();

  it('returns "error" for null', () => {
    expect(svc.calculateStatus(null)).toBe('error');
  });

  it('returns "error" for undefined', () => {
    expect(svc.calculateStatus(undefined)).toBe('error');
  });

  it('returns "error" for a plain object (not an array)', () => {
    expect(svc.calculateStatus({} as unknown as EmailFailure[])).toBe('error');
  });

  it('returns "error" for a number', () => {
    expect(svc.calculateStatus(42 as unknown as EmailFailure[])).toBe('error');
  });
});

describe('calculateStatus — empty array → "healthy"', () => {
  const svc = makeService();

  it('returns "healthy" for an empty array', () => {
    expect(svc.calculateStatus([])).toBe('healthy');
  });
});

describe('calculateStatus — 1-10 failures → "degraded"', () => {
  const svc = makeService();

  it('returns "degraded" for 1 failure', () => {
    expect(svc.calculateStatus(makeFailures(1))).toBe('degraded');
  });

  it('returns "degraded" for 5 failures', () => {
    expect(svc.calculateStatus(makeFailures(5))).toBe('degraded');
  });

  it('returns "degraded" for exactly 10 failures (upper boundary of degraded)', () => {
    expect(svc.calculateStatus(makeFailures(10))).toBe('degraded');
  });
});

describe('calculateStatus — > 10 failures → "error"', () => {
  const svc = makeService();

  it('returns "error" for exactly 11 failures (just over boundary)', () => {
    expect(svc.calculateStatus(makeFailures(11))).toBe('error');
  });

  it('returns "error" for 50 failures', () => {
    expect(svc.calculateStatus(makeFailures(50))).toBe('error');
  });
});

// ── getFailures — no filters ──────────────────────────────────────────────────

describe('getFailures — no filters', () => {
  it('returns all items when the failure list has fewer than pageSize entries', () => {
    const svc = makeService(makeFailures(3));
    const { items, total } = svc.getFailures();
    expect(total).toBe(3);
    expect(items).toHaveLength(3);
  });

  it('returns empty items and total=0 when no failures exist', () => {
    const svc = makeService([]);
    const { items, total } = svc.getFailures();
    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });

  it('default pageSize is 10 — returns at most 10 items', () => {
    const svc = makeService(makeFailures(15));
    const { items, total } = svc.getFailures();
    expect(total).toBe(15);
    expect(items).toHaveLength(10);
  });
});

// ── getFailures — requestId filter ────────────────────────────────────────────

describe('getFailures — requestId filter', () => {
  it('returns only failures whose requestId includes the filter string', () => {
    const svc = makeService([
      makeFailure({ requestId: 'abc-123' }),
      makeFailure({ requestId: 'xyz-456' }),
      makeFailure({ requestId: 'abc-789' }),
    ]);
    const { items, total } = svc.getFailures({ requestId: 'abc' });
    expect(total).toBe(2);
    expect(items.every((f) => f.requestId.includes('abc'))).toBe(true);
  });

  it('returns empty when no requestId matches', () => {
    const svc = makeService([makeFailure({ requestId: 'unique-001' })]);
    const { items, total } = svc.getFailures({ requestId: 'no-match' });
    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });
});

// ── getFailures — operation filter ────────────────────────────────────────────

describe('getFailures — operation filter (case-insensitive exact match)', () => {
  it('returns failures matching the operation (same case)', () => {
    const svc = makeService([
      makeFailure({ operation: 'fetch' }),
      makeFailure({ operation: 'insert' }),
      makeFailure({ operation: 'fetch' }),
    ]);
    const { items, total } = svc.getFailures({ operation: 'fetch' });
    expect(total).toBe(2);
    expect(items.every((f) => f.operation === 'fetch')).toBe(true);
  });

  it('matches operation case-insensitively', () => {
    const svc = makeService([makeFailure({ operation: 'FETCH' })]);
    const { items, total } = svc.getFailures({ operation: 'fetch' });
    expect(total).toBe(1);
    expect(items[0].operation).toBe('FETCH');
  });

  it('returns empty when operation does not match exactly', () => {
    const svc = makeService([makeFailure({ operation: 'fetch' })]);
    const { items, total } = svc.getFailures({ operation: 'insert' });
    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });
});

// ── getFailures — resource filter ─────────────────────────────────────────────

describe('getFailures — resource filter (case-insensitive substring)', () => {
  it('returns failures whose resource includes the filter string', () => {
    const svc = makeService([
      makeFailure({ resource: 'email_threads' }),
      makeFailure({ resource: 'email_accounts' }),
      makeFailure({ resource: 'contacts' }),
    ]);
    const { items, total } = svc.getFailures({ resource: 'email' });
    expect(total).toBe(2);
    expect(items.every((f) => f.resource.includes('email'))).toBe(true);
  });

  it('matches resource case-insensitively', () => {
    const svc = makeService([makeFailure({ resource: 'EMAIL_THREADS' })]);
    const { total } = svc.getFailures({ resource: 'email' });
    expect(total).toBe(1);
  });

  it('returns empty when resource does not match', () => {
    const svc = makeService([makeFailure({ resource: 'email_threads' })]);
    const { total } = svc.getFailures({ resource: 'contacts' });
    expect(total).toBe(0);
  });
});

// ── getFailures — pagination ──────────────────────────────────────────────────

describe('getFailures — pagination', () => {
  it('page=1, pageSize=3 returns first 3 items', () => {
    const failures = makeFailures(7);
    const svc = makeService(failures);
    const { items, total } = svc.getFailures({ page: 1, pageSize: 3 });
    expect(total).toBe(7);
    expect(items).toHaveLength(3);
    expect(items[0].requestId).toBe(failures[0].requestId);
  });

  it('page=2, pageSize=3 returns items 4-6', () => {
    const failures = makeFailures(7);
    const svc = makeService(failures);
    const { items } = svc.getFailures({ page: 2, pageSize: 3 });
    expect(items).toHaveLength(3);
    expect(items[0].requestId).toBe(failures[3].requestId);
  });

  it('last page returns remaining items (fewer than pageSize)', () => {
    const failures = makeFailures(7);
    const svc = makeService(failures);
    const { items, total } = svc.getFailures({ page: 3, pageSize: 3 });
    expect(total).toBe(7);
    expect(items).toHaveLength(1);
    expect(items[0].requestId).toBe(failures[6].requestId);
  });

  it('total reflects pre-pagination count', () => {
    const svc = makeService(makeFailures(25));
    const { total, items } = svc.getFailures({ page: 1, pageSize: 10 });
    expect(total).toBe(25);
    expect(items).toHaveLength(10);
  });
});

// ── getFailures — null recentFailures ─────────────────────────────────────────

describe('getFailures — null recentFailures treated as empty', () => {
  it('returns items=[] and total=0 when recentFailures is null', () => {
    const svc = makeService(null);
    const { items, total } = svc.getFailures();
    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });
});
