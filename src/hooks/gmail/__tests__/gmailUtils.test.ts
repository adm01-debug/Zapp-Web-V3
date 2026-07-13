/**
 * Tests for pure utility functions exported from gmailTypes.ts and gmailApi.ts.
 *
 * No mocks needed — all six functions are purely algorithmic with no network,
 * Supabase, or React dependencies.
 *
 * Functions under test (gmailTypes.ts):
 *   isEmailThread(obj)
 *     — runtime type guard: true iff obj has 'email_thread_id' and 'account_id'
 *   isEmailMessage(obj)
 *     — runtime type guard: true iff obj has 'email_msg_id' and 'thread_id'
 *   isEmailTokenExpired(tokenInfo)
 *     — true iff tokenInfo.token_status === 'expired'
 *   isEmailWatchExpired(tokenInfo)
 *     — true iff tokenInfo.watch_status === 'expired'
 *
 * Functions under test (gmailApi.ts):
 *   isAuthError(error)
 *     — true iff error?.code === 401 OR error?.status === 'UNAUTHENTICATED'
 *   buildMimeMessage(params)
 *     — builds a base64url-encoded RFC-2822 MIME message string
 *
 * Covered:
 *   isEmailThread
 *     - null → false
 *     - primitive (string, number) → false
 *     - empty object → false
 *     - object with email_thread_id but missing account_id → false
 *     - object with account_id but missing email_thread_id → false
 *     - object with both required fields → true
 *     - full EmailThread-shaped object → true
 *   isEmailMessage
 *     - null → false
 *     - primitive → false
 *     - empty object → false
 *     - object with email_msg_id but missing thread_id → false
 *     - object with thread_id but missing email_msg_id → false
 *     - object with both required fields → true
 *   isEmailTokenExpired
 *     - 'expired' → true
 *     - 'valid' → false
 *     - 'expiring_soon' → false
 *     - 'no_token' → false
 *   isEmailWatchExpired
 *     - 'expired' → true
 *     - 'active' → false
 *     - 'expiring_soon' → false
 *     - 'no_watch' → false
 *   isAuthError
 *     - null → false
 *     - code 401 → true
 *     - code 403 → false (not auth in this guard)
 *     - code 404 → false
 *     - code 500 → false
 *     - status 'UNAUTHENTICATED' → true
 *     - status 'NOT_FOUND' → false
 *     - code 401 + status 'UNAUTHENTICATED' → true
 *   buildMimeMessage
 *     - returns a non-empty string
 *     - result contains only URL-safe base64 chars (no +, /, trailing =)
 *     - different inputs produce different outputs
 *     - Cc header is included only when cc array is non-empty
 *     - In-Reply-To header is included only when inReplyTo is provided
 */
import { describe, it, expect } from 'vitest';
import {
  isEmailThread,
  isEmailMessage,
  isEmailTokenExpired,
  isEmailWatchExpired,
} from '../gmailTypes';
import type { EmailTokenInfo } from '../gmailTypes';
import { isAuthError, buildMimeMessage } from '../gmailApi';
import type { EmailApiError } from '../gmailApi';

// ── helpers ────────────────────────────────────────────────────────────────────

function tokenInfo(
  token_status: EmailTokenInfo['token_status'],
  watch_status: EmailTokenInfo['watch_status'] = 'active',
): EmailTokenInfo {
  return {
    account_id: 'acct-1',
    email: 'test@example.com',
    is_active: true,
    token_status,
    token_expiry: null,
    watch_status,
    watch_expiry: null,
    minutes_until_expiry: null,
  };
}

function apiError(overrides: Partial<EmailApiError>): EmailApiError {
  return { code: 200, message: 'ok', status: 'OK', ...overrides };
}

// ── isEmailThread ──────────────────────────────────────────────────────────────

describe('isEmailThread — type guard', () => {
  it('returns false for null', () => {
    expect(isEmailThread(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isEmailThread('not an object')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isEmailThread(42)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isEmailThread({})).toBe(false);
  });

  it('returns false when only email_thread_id is present (missing account_id)', () => {
    expect(isEmailThread({ email_thread_id: 'tid-1' })).toBe(false);
  });

  it('returns false when only account_id is present (missing email_thread_id)', () => {
    expect(isEmailThread({ account_id: 'acct-1' })).toBe(false);
  });

  it('returns true when both required fields are present', () => {
    expect(isEmailThread({ email_thread_id: 'tid-1', account_id: 'acct-1' })).toBe(true);
  });

  it('returns true for a full EmailThread-shaped object', () => {
    const thread = {
      id: 'row-1',
      account_id: 'acct-1',
      email_thread_id: 'gmail-tid',
      subject: 'Hello',
      snippet: null,
      from_email: null,
      from_name: null,
      label_ids: [],
      unread_count: 0,
      message_count: 1,
      is_starred: false,
      is_important: false,
      sla_status: null,
      assigned_to: null,
      last_message_at: null,
      first_reply_at: null,
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(isEmailThread(thread)).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(isEmailThread(undefined)).toBe(false);
  });
});

// ── isEmailMessage ─────────────────────────────────────────────────────────────

describe('isEmailMessage — type guard', () => {
  it('returns false for null', () => {
    expect(isEmailMessage(null)).toBe(false);
  });

  it('returns false for a primitive', () => {
    expect(isEmailMessage(123)).toBe(false);
    expect(isEmailMessage('str')).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isEmailMessage({})).toBe(false);
  });

  it('returns false when only email_msg_id is present (missing thread_id)', () => {
    expect(isEmailMessage({ email_msg_id: 'msg-1' })).toBe(false);
  });

  it('returns false when only thread_id is present (missing email_msg_id)', () => {
    expect(isEmailMessage({ thread_id: 'tid-1' })).toBe(false);
  });

  it('returns true when both required fields are present', () => {
    expect(isEmailMessage({ email_msg_id: 'msg-1', thread_id: 'tid-1' })).toBe(true);
  });

  it('returns true for an object with extra fields beyond the required two', () => {
    expect(isEmailMessage({ email_msg_id: 'msg-1', thread_id: 'tid-1', subject: 'Hi' })).toBe(true);
  });
});

// ── isEmailTokenExpired ────────────────────────────────────────────────────────

describe('isEmailTokenExpired', () => {
  it('returns true when token_status is "expired"', () => {
    expect(isEmailTokenExpired(tokenInfo('expired'))).toBe(true);
  });

  it('returns false when token_status is "valid"', () => {
    expect(isEmailTokenExpired(tokenInfo('valid'))).toBe(false);
  });

  it('returns false when token_status is "expiring_soon"', () => {
    expect(isEmailTokenExpired(tokenInfo('expiring_soon'))).toBe(false);
  });

  it('returns false when token_status is "no_token"', () => {
    expect(isEmailTokenExpired(tokenInfo('no_token'))).toBe(false);
  });
});

// ── isEmailWatchExpired ────────────────────────────────────────────────────────

describe('isEmailWatchExpired', () => {
  it('returns true when watch_status is "expired"', () => {
    expect(isEmailWatchExpired(tokenInfo('valid', 'expired'))).toBe(true);
  });

  it('returns false when watch_status is "active"', () => {
    expect(isEmailWatchExpired(tokenInfo('valid', 'active'))).toBe(false);
  });

  it('returns false when watch_status is "expiring_soon"', () => {
    expect(isEmailWatchExpired(tokenInfo('valid', 'expiring_soon'))).toBe(false);
  });

  it('returns false when watch_status is "no_watch"', () => {
    expect(isEmailWatchExpired(tokenInfo('valid', 'no_watch'))).toBe(false);
  });

  it('token and watch statuses are independent', () => {
    const ti = tokenInfo('expired', 'expired');
    expect(isEmailTokenExpired(ti)).toBe(true);
    expect(isEmailWatchExpired(ti)).toBe(true);
  });
});

// ── isAuthError ────────────────────────────────────────────────────────────────

describe('isAuthError', () => {
  it('returns false for null', () => {
    expect(isAuthError(null)).toBe(false);
  });

  it('returns true when code is 401', () => {
    expect(isAuthError(apiError({ code: 401 }))).toBe(true);
  });

  it('returns false when code is 403 (not covered by this guard)', () => {
    expect(isAuthError(apiError({ code: 403 }))).toBe(false);
  });

  it('returns false when code is 404', () => {
    expect(isAuthError(apiError({ code: 404 }))).toBe(false);
  });

  it('returns false when code is 500', () => {
    expect(isAuthError(apiError({ code: 500 }))).toBe(false);
  });

  it('returns true when status is "UNAUTHENTICATED"', () => {
    expect(isAuthError(apiError({ code: 200, status: 'UNAUTHENTICATED' }))).toBe(true);
  });

  it('returns false when status is "NOT_FOUND"', () => {
    expect(isAuthError(apiError({ code: 404, status: 'NOT_FOUND' }))).toBe(false);
  });

  it('returns true when both code 401 and UNAUTHENTICATED status are set', () => {
    expect(isAuthError(apiError({ code: 401, status: 'UNAUTHENTICATED' }))).toBe(true);
  });
});

// ── buildMimeMessage ───────────────────────────────────────────────────────────

describe('buildMimeMessage — base64url-encoded MIME', () => {
  const BASE_PARAMS = {
    from: 'sender@example.com',
    to: ['recipient@example.com'],
    subject: 'Test Subject',
    html: '<p>Hello</p>',
  };

  it('returns a non-empty string', () => {
    const result = buildMimeMessage(BASE_PARAMS);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('result is URL-safe base64 (no +, /, or trailing =)', () => {
    const result = buildMimeMessage(BASE_PARAMS);
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toMatch(/=+$/);
  });

  it('result matches URL-safe base64 pattern', () => {
    const result = buildMimeMessage(BASE_PARAMS);
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('different subjects produce different encoded strings', () => {
    const r1 = buildMimeMessage({ ...BASE_PARAMS, subject: 'Subject A' });
    const r2 = buildMimeMessage({ ...BASE_PARAMS, subject: 'Subject B' });
    expect(r1).not.toBe(r2);
  });

  it('different recipients produce different encoded strings', () => {
    const r1 = buildMimeMessage({ ...BASE_PARAMS, to: ['a@example.com'] });
    const r2 = buildMimeMessage({ ...BASE_PARAMS, to: ['b@example.com'] });
    expect(r1).not.toBe(r2);
  });

  it('Cc header is included when cc array is provided', () => {
    const withCc = buildMimeMessage({ ...BASE_PARAMS, cc: ['cc@example.com'] });
    const withoutCc = buildMimeMessage(BASE_PARAMS);
    // The with-cc output encodes a longer MIME message, so they differ
    expect(withCc).not.toBe(withoutCc);
  });

  it('Cc header is absent (shorter output) when cc is not provided', () => {
    const withCc = buildMimeMessage({ ...BASE_PARAMS, cc: ['cc@example.com'] });
    const withoutCc = buildMimeMessage(BASE_PARAMS);
    // cc adds at least "Cc: cc@example.com\r\n" → longer encoded string
    expect(withCc.length).toBeGreaterThan(withoutCc.length);
  });

  it('In-Reply-To is included when inReplyTo is provided', () => {
    const withReply = buildMimeMessage({ ...BASE_PARAMS, inReplyTo: '<orig@mail.example.com>' });
    const withoutReply = buildMimeMessage(BASE_PARAMS);
    expect(withReply).not.toBe(withoutReply);
    expect(withReply.length).toBeGreaterThan(withoutReply.length);
  });

  it('same inputs always produce the same encoded string (deterministic)', () => {
    const r1 = buildMimeMessage(BASE_PARAMS);
    const r2 = buildMimeMessage(BASE_PARAMS);
    expect(r1).toBe(r2);
  });
});
