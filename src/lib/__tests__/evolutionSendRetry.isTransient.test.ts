/**
 * Tests for the `isTransient` helper exported from evolutionSendRetry.
 *
 * isTransient(err) classifies a thrown value as "retryable" (true) or
 * "permanent" (false).  Logic has three branches:
 *   1. Falsy → false
 *   2. Error instance → check .status numeric field OR message patterns
 *   3. Plain object → check .status numeric field OR .message string patterns
 */
import { describe, it, expect, vi } from 'vitest';

// ── Mock every import that evolutionSendRetry pulls in ───────────────────────
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/retry', () => ({ withRetry: vi.fn() }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/failedMessagesEnqueue', () => ({ enqueueClientFailedMessage: vi.fn() }));
vi.mock('@/lib/retryConfig', () => ({ loadRetryConfig: vi.fn().mockResolvedValue({ maxRetries: 3, baseBackoffMs: 100, maxBackoffMs: 5000 }) }));
vi.mock('@/lib/crossTabSendDedupe', () => ({ crossTabDedupe: vi.fn() }));
vi.mock('@/lib/requestDedupeKey', () => ({ buildRequestDedupeKey: vi.fn().mockResolvedValue('key') }));
vi.mock('@/lib/sendFunctionRouter', () => ({ resolveSendFunction: vi.fn().mockResolvedValue('evolution-api') }));
vi.mock('@/lib/evolutionCircuitBreaker', () => ({
  canCall: vi.fn().mockReturnValue({ allowed: true }),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
  CircuitOpenError: class CircuitOpenError extends Error { constructor(n: string) { super(n); } },
}));

import { isTransient } from '../evolutionSendRetry';

// ── falsy inputs ──────────────────────────────────────────────────────────────

describe('isTransient — falsy inputs', () => {
  it('returns false for null', () => expect(isTransient(null)).toBe(false));
  it('returns false for undefined', () => expect(isTransient(undefined)).toBe(false));
  it('returns false for 0', () => expect(isTransient(0)).toBe(false));
  it('returns false for false', () => expect(isTransient(false)).toBe(false));
  it('returns false for empty string', () => expect(isTransient('')).toBe(false));
});

// ── Error instance — .status numeric field ────────────────────────────────────

describe('isTransient — Error with numeric .status', () => {
  function errWithStatus(msg: string, status: number) {
    return Object.assign(new Error(msg), { status });
  }

  it('returns true for status 500', () => expect(isTransient(errWithStatus('oops', 500))).toBe(true));
  it('returns true for status 502', () => expect(isTransient(errWithStatus('bad gw', 502))).toBe(true));
  it('returns true for status 503', () => expect(isTransient(errWithStatus('unavailable', 503))).toBe(true));
  it('returns true for status 504', () => expect(isTransient(errWithStatus('gateway timeout', 504))).toBe(true));
  it('returns true for status 429 (rate limit)', () => expect(isTransient(errWithStatus('too many', 429))).toBe(true));
  it('returns false for status 400', () => expect(isTransient(errWithStatus('bad request', 400))).toBe(false));
  it('returns false for status 401', () => expect(isTransient(errWithStatus('unauthorized', 401))).toBe(false));
  it('returns false for status 404', () => expect(isTransient(errWithStatus('not found', 404))).toBe(false));
});

// ── Error instance — message pattern matching ─────────────────────────────────

describe('isTransient — Error with transient message patterns', () => {
  it('returns true when message contains "fetch"', () => expect(isTransient(new Error('fetch failed'))).toBe(true));
  it('returns true when message contains "network"', () => expect(isTransient(new Error('network error'))).toBe(true));
  it('returns true when message contains "timeout"', () => expect(isTransient(new Error('request timeout'))).toBe(true));
  it('returns true when message contains "aborted"', () => expect(isTransient(new Error('connection aborted'))).toBe(true));
  it('returns true when message contains "econnreset"', () => expect(isTransient(new Error('ECONNRESET'))).toBe(true));
  it('returns true when message contains "enotfound"', () => expect(isTransient(new Error('ENOTFOUND dns'))).toBe(true));
  it('returns true when message contains "unavailable"', () => expect(isTransient(new Error('service unavailable'))).toBe(true));
  it('returns true when message contains "temporarily"', () => expect(isTransient(new Error('temporarily down'))).toBe(true));
  it('returns true when message contains "gateway"', () => expect(isTransient(new Error('bad gateway'))).toBe(true));

  it('returns false for an unrelated error message', () => expect(isTransient(new Error('invalid phone number'))).toBe(false));
  it('returns false for an empty message Error', () => expect(isTransient(new Error(''))).toBe(false));
});

// ── Error instance — status code in message string (regex) ────────────────────

describe('isTransient — Error with status code in message', () => {
  it('returns true when message contains "502"', () => expect(isTransient(new Error('HTTP 502 bad gateway'))).toBe(true));
  it('returns true when message contains "503"', () => expect(isTransient(new Error('got 503'))).toBe(true));
  it('returns true when message contains "504"', () => expect(isTransient(new Error('504 timeout'))).toBe(true));
  it('returns true when message contains "429"', () => expect(isTransient(new Error('rate limited: 429'))).toBe(true));
  it('returns false when status "5024" appears (not a word boundary)', () => {
    // "5024" should NOT match the \b(502|503|504)\b regex
    expect(isTransient(new Error('code 5024 foo'))).toBe(false);
  });
});

// ── Plain object — .status numeric field ──────────────────────────────────────

describe('isTransient — plain object with .status', () => {
  it('returns true for { status: 500 }', () => expect(isTransient({ status: 500 })).toBe(true));
  it('returns true for { status: 503 }', () => expect(isTransient({ status: 503 })).toBe(true));
  it('returns true for { status: 429 }', () => expect(isTransient({ status: 429 })).toBe(true));
  it('returns false for { status: 400 }', () => expect(isTransient({ status: 400 })).toBe(false));
  it('returns false for { status: 422 }', () => expect(isTransient({ status: 422 })).toBe(false));
});

// ── Plain object — .message string patterns ───────────────────────────────────

describe('isTransient — plain object with .message', () => {
  it('returns true for { message: "fetch failed" }', () => expect(isTransient({ message: 'fetch failed' })).toBe(true));
  it('returns true for { message: "timeout" }', () => expect(isTransient({ message: 'timeout reached' })).toBe(true));
  it('returns true for { message: "Bad Gateway 502" }', () => expect(isTransient({ message: 'Bad Gateway 502' })).toBe(true));
  it('returns false for { message: "invalid body" }', () => expect(isTransient({ message: 'invalid body' })).toBe(false));
  it('returns false for plain object without status or message', () => expect(isTransient({ code: 'EAUTH' })).toBe(false));
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('isTransient — edge cases', () => {
  it('returns false for a number', () => expect(isTransient(42)).toBe(false));
  it('returns false for a plain string', () => expect(isTransient('timeout')).toBe(false));
  it('returns false for an empty plain object', () => expect(isTransient({})).toBe(false));
  it('returns false for an array', () => expect(isTransient([])).toBe(false));
  it('pattern match is case-insensitive for Error messages', () => {
    expect(isTransient(new Error('TIMEOUT'))).toBe(true);
    expect(isTransient(new Error('Fetch Failed'))).toBe(true);
  });
});
