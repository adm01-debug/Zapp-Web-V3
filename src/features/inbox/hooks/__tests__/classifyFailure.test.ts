/**
 * Tests for classifyFailure() and FAILURE_CATEGORY_LABEL exported from
 * useFailureMetricsBatch.ts.
 *
 * classifyFailure(finalHttpStatus, reasons, messageStatus) maps a row of
 * retry_metrics to one of five FailureCategory values.  The function has a
 * strict priority order — higher-priority guards short-circuit lower ones.
 *
 * Priority (highest → lowest):
 *   1. messageStatus === 'failed_auth'           → 'auth'
 *   2. lastReason === 'auth_failed'              → 'auth'
 *      finalHttpStatus === 401 or 403            → 'auth'
 *   3. lastReason === 'timeout'                  → 'network'
 *      lastReason === 'network_error'            → 'network'
 *   4. finalHttpStatus 500-599                   → 'http_5xx'
 *   5. finalHttpStatus 400-499 (excluding 401/403 caught earlier by rule 2)
 *                                                → 'http_4xx'
 *   6. fallthrough                               → 'unknown'
 *
 * FAILURE_CATEGORY_LABEL is a static Record<FailureCategory, string> with
 * one Portuguese label per category.
 *
 * No mocks needed — both exports are purely algorithmic with no side-effects.
 *
 * Covered:
 *   classifyFailure — branch 1 (messageStatus 'failed_auth')
 *     - messageStatus 'failed_auth' → 'auth' regardless of status/reasons
 *   classifyFailure — branch 2 (last reason or HTTP 401/403)
 *     - lastReason 'auth_failed' → 'auth'
 *     - finalHttpStatus 401 → 'auth'
 *     - finalHttpStatus 403 → 'auth'
 *     - branch 2 wins over branch 4 (401 beats generic 4xx check)
 *   classifyFailure — branch 3 (network / timeout)
 *     - lastReason 'timeout' → 'network'
 *     - lastReason 'network_error' → 'network'
 *     - network branch selected when finalHttpStatus is also provided (reason wins)
 *   classifyFailure — branch 4 (HTTP 5xx)
 *     - finalHttpStatus 500 → 'http_5xx'
 *     - finalHttpStatus 503 → 'http_5xx'
 *     - finalHttpStatus 599 → 'http_5xx'
 *     - finalHttpStatus 600 is NOT 5xx → falls through to 'unknown'
 *   classifyFailure — branch 5 (HTTP 4xx, non-auth)
 *     - finalHttpStatus 404 → 'http_4xx'
 *     - finalHttpStatus 422 → 'http_4xx'
 *     - finalHttpStatus 400 → 'http_4xx'
 *   classifyFailure — branch 6 (unknown / fallthrough)
 *     - null status, null reasons → 'unknown'
 *     - empty reasons array, null status → 'unknown'
 *     - finalHttpStatus 200 → 'unknown'
 *   classifyFailure — reasons array handling
 *     - only the LAST entry in the reasons array is used
 *     - null reasons array is treated as empty
 *   FAILURE_CATEGORY_LABEL — static Record
 *     - has exactly 5 entries
 *     - every FailureCategory key is present
 *     - all values are non-empty strings
 */
import { describe, it, expect } from 'vitest';
import { classifyFailure, FAILURE_CATEGORY_LABEL } from '../useFailureMetricsBatch';
import type { FailureCategory } from '../useFailureMetricsBatch';

// ── helpers ───────────────────────────────────────────────────────────────────

type RetryReason = { attempt: number; status?: number; reason: string };

function reasons(...entries: Array<{ reason: string; attempt?: number }>): RetryReason[] {
  return entries.map(({ reason, attempt = 1 }, i) => ({ attempt: attempt ?? i + 1, reason }));
}

// ── branch 1: messageStatus 'failed_auth' ────────────────────────────────────

describe('classifyFailure — messageStatus failed_auth (branch 1)', () => {
  it('returns "auth" when messageStatus is "failed_auth"', () => {
    expect(classifyFailure(null, null, 'failed_auth')).toBe('auth');
  });

  it('returns "auth" for "failed_auth" even when finalHttpStatus is 500', () => {
    expect(classifyFailure(500, null, 'failed_auth')).toBe('auth');
  });

  it('returns "auth" for "failed_auth" even when reasons contain timeout', () => {
    expect(classifyFailure(null, reasons({ reason: 'timeout' }), 'failed_auth')).toBe('auth');
  });
});

// ── branch 2: auth via lastReason or HTTP 401/403 ────────────────────────────

describe('classifyFailure — auth via lastReason or status (branch 2)', () => {
  it('returns "auth" when lastReason is "auth_failed"', () => {
    expect(classifyFailure(null, reasons({ reason: 'auth_failed' }), null)).toBe('auth');
  });

  it('returns "auth" when finalHttpStatus is 401', () => {
    expect(classifyFailure(401, null, null)).toBe('auth');
  });

  it('returns "auth" when finalHttpStatus is 403', () => {
    expect(classifyFailure(403, null, null)).toBe('auth');
  });

  it('branch 2 wins over branch 4: 401 → "auth", not "http_4xx"', () => {
    expect(classifyFailure(401, null, 'failed')).toBe('auth');
  });

  it('branch 2 wins over branch 4: 403 → "auth", not "http_4xx"', () => {
    expect(classifyFailure(403, null, 'failed_retries')).toBe('auth');
  });
});

// ── branch 3: network / timeout ──────────────────────────────────────────────

describe('classifyFailure — network via lastReason (branch 3)', () => {
  it('returns "network" when lastReason is "timeout"', () => {
    expect(classifyFailure(null, reasons({ reason: 'timeout' }), null)).toBe('network');
  });

  it('returns "network" when lastReason is "network_error"', () => {
    expect(classifyFailure(null, reasons({ reason: 'network_error' }), null)).toBe('network');
  });

  it('returns "network" even when a non-null finalHttpStatus is present (reason takes priority)', () => {
    expect(classifyFailure(503, reasons({ reason: 'timeout' }), null)).toBe('network');
  });
});

// ── branch 4: HTTP 5xx ────────────────────────────────────────────────────────

describe('classifyFailure — http_5xx (branch 4)', () => {
  it('returns "http_5xx" for finalHttpStatus 500', () => {
    expect(classifyFailure(500, null, null)).toBe('http_5xx');
  });

  it('returns "http_5xx" for finalHttpStatus 503', () => {
    expect(classifyFailure(503, null, null)).toBe('http_5xx');
  });

  it('returns "http_5xx" for finalHttpStatus 599 (upper boundary)', () => {
    expect(classifyFailure(599, null, null)).toBe('http_5xx');
  });

  it('does NOT return "http_5xx" for finalHttpStatus 600 (outside range)', () => {
    expect(classifyFailure(600, null, null)).toBe('unknown');
  });
});

// ── branch 5: HTTP 4xx (non-auth) ────────────────────────────────────────────

describe('classifyFailure — http_4xx (branch 5)', () => {
  it('returns "http_4xx" for finalHttpStatus 404', () => {
    expect(classifyFailure(404, null, null)).toBe('http_4xx');
  });

  it('returns "http_4xx" for finalHttpStatus 422', () => {
    expect(classifyFailure(422, null, null)).toBe('http_4xx');
  });

  it('returns "http_4xx" for finalHttpStatus 400 (lower boundary)', () => {
    expect(classifyFailure(400, null, null)).toBe('http_4xx');
  });

  it('returns "http_4xx" for finalHttpStatus 499 (upper boundary)', () => {
    expect(classifyFailure(499, null, null)).toBe('http_4xx');
  });
});

// ── branch 6: unknown / fallthrough ──────────────────────────────────────────

describe('classifyFailure — unknown (branch 6)', () => {
  it('returns "unknown" when both finalHttpStatus and reasons are null', () => {
    expect(classifyFailure(null, null, null)).toBe('unknown');
  });

  it('returns "unknown" for empty reasons array and null status', () => {
    expect(classifyFailure(null, [], null)).toBe('unknown');
  });

  it('returns "unknown" for finalHttpStatus 200 (success not a failure category)', () => {
    expect(classifyFailure(200, null, null)).toBe('unknown');
  });

  it('returns "unknown" when messageStatus is "failed" with no other signals', () => {
    expect(classifyFailure(null, null, 'failed')).toBe('unknown');
  });
});

// ── reasons array handling ────────────────────────────────────────────────────

describe('classifyFailure — reasons array: only last entry matters', () => {
  it('uses the LAST reason entry, ignoring earlier ones', () => {
    // First entry says auth_failed, last says timeout → should be 'network'
    const r = reasons({ reason: 'auth_failed' }, { reason: 'timeout' });
    expect(classifyFailure(null, r, null)).toBe('network');
  });

  it('uses the LAST reason entry for auth detection', () => {
    // First entry is innocuous, last is auth_failed → 'auth'
    const r = reasons({ reason: 'timeout' }, { reason: 'auth_failed' });
    expect(classifyFailure(null, r, null)).toBe('auth');
  });

  it('treats null reasons as no-reasons (falls through to http status)', () => {
    expect(classifyFailure(503, null, null)).toBe('http_5xx');
  });
});

// ── result type ───────────────────────────────────────────────────────────────

describe('classifyFailure — result type', () => {
  it('always returns a string', () => {
    expect(typeof classifyFailure(null, null, null)).toBe('string');
  });

  it('result is one of the five allowed FailureCategory values', () => {
    const allowed: FailureCategory[] = ['auth', 'http_4xx', 'http_5xx', 'network', 'unknown'];
    const cases: Array<[number | null, null, string | null]> = [
      [null, null, 'failed_auth'],
      [401, null, null],
      [null, null, null],
      [500, null, null],
      [404, null, null],
    ];
    for (const [status, r, ms] of cases) {
      expect(allowed).toContain(classifyFailure(status, r, ms));
    }
  });
});

// ── FAILURE_CATEGORY_LABEL — static Record ────────────────────────────────────

describe('FAILURE_CATEGORY_LABEL — static Record', () => {
  it('has exactly 5 entries', () => {
    expect(Object.keys(FAILURE_CATEGORY_LABEL)).toHaveLength(5);
  });

  it('contains an entry for every FailureCategory', () => {
    const categories: FailureCategory[] = ['auth', 'http_4xx', 'http_5xx', 'network', 'unknown'];
    for (const cat of categories) {
      expect(FAILURE_CATEGORY_LABEL).toHaveProperty(cat);
    }
  });

  it('all label values are non-empty strings', () => {
    for (const label of Object.values(FAILURE_CATEGORY_LABEL)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('"auth" label describes authentication failure', () => {
    expect(FAILURE_CATEGORY_LABEL.auth.toLowerCase()).toMatch(/auth|autentic/);
  });

  it('"unknown" label covers "Outras" or similar catch-all', () => {
    expect(FAILURE_CATEGORY_LABEL.unknown.length).toBeGreaterThan(0);
  });
});
