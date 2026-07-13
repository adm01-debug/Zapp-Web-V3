import { describe, it, expect } from 'vitest';
import {
  classifyRootCause,
  getRootCauseMeta,
  aggregateByRootCause,
  ALL_ROOT_CAUSES,
} from '@/lib/failureRootCause';

// ── classifyRootCause — error_code precedence ─────────────────────────────────
describe('classifyRootCause — error_code', () => {
  it('classifies "timeout" error_code', () => {
    expect(classifyRootCause({ error_code: 'timeout' })).toBe('timeout');
  });

  it('classifies "etimedout" error_code', () => {
    expect(classifyRootCause({ error_code: 'ETIMEDOUT' })).toBe('timeout');
  });

  it('classifies partial timeout code (contains "timeout")', () => {
    expect(classifyRootCause({ error_code: 'connection_timeout' })).toBe('timeout');
  });

  it('classifies "network_error" error_code', () => {
    expect(classifyRootCause({ error_code: 'network_error' })).toBe('network');
  });

  it('classifies "econnreset" error_code', () => {
    expect(classifyRootCause({ error_code: 'ECONNRESET' })).toBe('network');
  });

  it('classifies "econnrefused" error_code', () => {
    expect(classifyRootCause({ error_code: 'econnrefused' })).toBe('network');
  });

  it('classifies "rate_limit" error_code', () => {
    expect(classifyRootCause({ error_code: 'rate_limit' })).toBe('rate_limit');
  });

  it('classifies "throttled" error_code', () => {
    expect(classifyRootCause({ error_code: 'throttled' })).toBe('rate_limit');
  });

  it('classifies "unauthorized" error_code', () => {
    expect(classifyRootCause({ error_code: 'unauthorized' })).toBe('auth');
  });

  it('classifies "forbidden" error_code', () => {
    expect(classifyRootCause({ error_code: 'forbidden' })).toBe('auth');
  });

  it('classifies "auth_failed" error_code', () => {
    expect(classifyRootCause({ error_code: 'auth_failed' })).toBe('auth');
  });

  it('classifies "invalid_payload" error_code', () => {
    expect(classifyRootCause({ error_code: 'invalid_payload' })).toBe('invalid_payload');
  });

  it('classifies "bad_request" error_code', () => {
    expect(classifyRootCause({ error_code: 'bad_request' })).toBe('invalid_payload');
  });

  it('classifies "not_found" error_code', () => {
    expect(classifyRootCause({ error_code: 'not_found' })).toBe('not_found');
  });

  it('classifies "unavailable" error_code', () => {
    expect(classifyRootCause({ error_code: 'unavailable' })).toBe('unavailable');
  });

  it('classifies "service_unavailable" error_code', () => {
    expect(classifyRootCause({ error_code: 'service_unavailable' })).toBe('unavailable');
  });

  it('classifies "bad_gateway" error_code', () => {
    expect(classifyRootCause({ error_code: 'bad_gateway' })).toBe('unavailable');
  });

  it('classifies "http_429" pattern', () => {
    expect(classifyRootCause({ error_code: 'http_429' })).toBe('rate_limit');
  });

  it('classifies "http-503" pattern', () => {
    expect(classifyRootCause({ error_code: 'http-503' })).toBe('unavailable');
  });
});

// ── classifyRootCause — http_status fallback ──────────────────────────────────
describe('classifyRootCause — http_status', () => {
  it('classifies 429 as rate_limit', () => {
    expect(classifyRootCause({ http_status: 429 })).toBe('rate_limit');
  });

  it('classifies 401 as auth', () => {
    expect(classifyRootCause({ http_status: 401 })).toBe('auth');
  });

  it('classifies 403 as auth', () => {
    expect(classifyRootCause({ http_status: 403 })).toBe('auth');
  });

  it('classifies 404 as not_found', () => {
    expect(classifyRootCause({ http_status: 404 })).toBe('not_found');
  });

  it('classifies 400 as invalid_payload', () => {
    expect(classifyRootCause({ http_status: 400 })).toBe('invalid_payload');
  });

  it('classifies 422 as invalid_payload', () => {
    expect(classifyRootCause({ http_status: 422 })).toBe('invalid_payload');
  });

  it('classifies 502 as unavailable', () => {
    expect(classifyRootCause({ http_status: 502 })).toBe('unavailable');
  });

  it('classifies 503 as unavailable', () => {
    expect(classifyRootCause({ http_status: 503 })).toBe('unavailable');
  });

  it('classifies 504 as unavailable', () => {
    expect(classifyRootCause({ http_status: 504 })).toBe('unavailable');
  });

  it('classifies generic 500 as server_error', () => {
    expect(classifyRootCause({ http_status: 500 })).toBe('server_error');
  });

  it('classifies 599 as server_error', () => {
    expect(classifyRootCause({ http_status: 599 })).toBe('server_error');
  });

  it('classifies 200 as unknown (success status implies no real error)', () => {
    expect(classifyRootCause({ http_status: 200 })).toBe('unknown');
  });
});

// ── classifyRootCause — error_message heuristics ──────────────────────────────
describe('classifyRootCause — error_message heuristics', () => {
  it('classifies "connection timed out" as timeout', () => {
    expect(classifyRootCause({ error_message: 'connection timed out' })).toBe('timeout');
  });

  it('classifies "too many requests" as rate_limit', () => {
    expect(classifyRootCause({ error_message: 'too many requests' })).toBe('rate_limit');
  });

  it('classifies "invalid token" as auth', () => {
    expect(classifyRootCause({ error_message: 'invalid token provided' })).toBe('auth');
  });

  it('classifies "503 service unavailable" as unavailable', () => {
    expect(classifyRootCause({ error_message: '503 service unavailable' })).toBe('unavailable');
  });

  it('classifies "fetch failed" as network', () => {
    expect(classifyRootCause({ error_message: 'fetch failed' })).toBe('network');
  });

  it('classifies "not found" as not_found', () => {
    expect(classifyRootCause({ error_message: 'resource not found' })).toBe('not_found');
  });

  it('classifies "malformed JSON" as invalid_payload', () => {
    expect(classifyRootCause({ error_message: 'malformed JSON body' })).toBe('invalid_payload');
  });
});

// ── classifyRootCause — empty / null inputs ────────────────────────────────────
describe('classifyRootCause — empty inputs', () => {
  it('returns unknown for completely empty input', () => {
    expect(classifyRootCause({})).toBe('unknown');
  });

  it('returns unknown for all null fields', () => {
    expect(classifyRootCause({ error_code: null, http_status: null, error_message: null })).toBe('unknown');
  });
});

// ── getRootCauseMeta ──────────────────────────────────────────────────────────
describe('getRootCauseMeta', () => {
  it('returns meta for rate_limit', () => {
    const m = getRootCauseMeta('rate_limit');
    expect(m.cause).toBe('rate_limit');
    expect(m.tone).toBe('warning');
    expect(m.label.length).toBeGreaterThan(0);
    expect(m.hint.length).toBeGreaterThan(0);
  });

  it('returns meta for auth with destructive tone', () => {
    expect(getRootCauseMeta('auth').tone).toBe('destructive');
  });

  it('returns meta for unknown with muted tone', () => {
    expect(getRootCauseMeta('unknown').tone).toBe('muted');
  });

  it('covers all canonical causes', () => {
    for (const cause of ALL_ROOT_CAUSES) {
      const m = getRootCauseMeta(cause);
      expect(m.cause).toBe(cause);
    }
  });
});

// ── ALL_ROOT_CAUSES ───────────────────────────────────────────────────────────
describe('ALL_ROOT_CAUSES', () => {
  it('contains 9 canonical causes', () => {
    expect(ALL_ROOT_CAUSES).toHaveLength(9);
  });

  it('includes "unknown" as a cause', () => {
    expect(ALL_ROOT_CAUSES).toContain('unknown');
  });
});

// ── aggregateByRootCause ──────────────────────────────────────────────────────
describe('aggregateByRootCause', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateByRootCause([])).toEqual([]);
  });

  it('groups and counts by cause', () => {
    const rows = [
      { http_status: 429 },
      { http_status: 429 },
      { http_status: 500 },
    ];
    const result = aggregateByRootCause(rows);
    const rateLimitEntry = result.find((r) => r.cause === 'rate_limit');
    const serverErrorEntry = result.find((r) => r.cause === 'server_error');
    expect(rateLimitEntry?.count).toBe(2);
    expect(serverErrorEntry?.count).toBe(1);
  });

  it('sorts by count descending', () => {
    const rows = [
      { http_status: 500 },
      { http_status: 429 },
      { http_status: 429 },
      { http_status: 429 },
    ];
    const result = aggregateByRootCause(rows);
    expect(result[0].cause).toBe('rate_limit');
    expect(result[0].count).toBe(3);
  });

  it('attaches meta to each entry', () => {
    const rows = [{ http_status: 401 }];
    const result = aggregateByRootCause(rows);
    expect(result[0].meta).toBeDefined();
    expect(result[0].meta.cause).toBe('auth');
  });
});
