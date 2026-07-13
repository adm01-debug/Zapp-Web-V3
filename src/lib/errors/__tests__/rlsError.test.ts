import { describe, it, expect } from 'vitest';
import {
  isRlsDeniedError,
  rlsDeniedMessage,
  formatAdminError,
  type RlsDeniedShape,
} from '../rlsError';

// ── isRlsDeniedError — falsy / non-object inputs ──────────────────────────────

describe('isRlsDeniedError — falsy / non-object inputs', () => {
  it('returns false for null', () => {
    expect(isRlsDeniedError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRlsDeniedError(undefined)).toBe(false);
  });

  it('returns false for 0', () => {
    expect(isRlsDeniedError(0)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRlsDeniedError('42501')).toBe(false);
  });

  it('returns false for false', () => {
    expect(isRlsDeniedError(false)).toBe(false);
  });
});

// ── isRlsDeniedError — code === '42501' ───────────────────────────────────────

describe('isRlsDeniedError — code 42501', () => {
  it('returns true when code is "42501"', () => {
    expect(isRlsDeniedError({ code: '42501' })).toBe(true);
  });

  it('returns false when code is a different string', () => {
    expect(isRlsDeniedError({ code: '23503' })).toBe(false);
  });

  it('returns false when code is numeric 42501 (not string)', () => {
    expect(isRlsDeniedError({ code: 42501 })).toBe(false);
  });
});

// ── isRlsDeniedError — status === 403 ────────────────────────────────────────

describe('isRlsDeniedError — status 403', () => {
  it('returns true when status is 403', () => {
    expect(isRlsDeniedError({ status: 403 })).toBe(true);
  });

  it('returns false when status is 401', () => {
    expect(isRlsDeniedError({ status: 401 })).toBe(false);
  });

  it('returns false when status is 500', () => {
    expect(isRlsDeniedError({ status: 500 })).toBe(false);
  });

  it('returns false when status is 404', () => {
    expect(isRlsDeniedError({ status: 404 })).toBe(false);
  });
});

// ── isRlsDeniedError — message patterns ──────────────────────────────────────

describe('isRlsDeniedError — message "forbidden"', () => {
  it('returns true for lowercase "forbidden"', () => {
    expect(isRlsDeniedError({ message: 'forbidden' })).toBe(true);
  });

  it('returns true for uppercase "FORBIDDEN"', () => {
    expect(isRlsDeniedError({ message: 'FORBIDDEN' })).toBe(true);
  });

  it('returns true when "forbidden" is embedded in a longer message', () => {
    expect(isRlsDeniedError({ message: 'Access is forbidden for this user' })).toBe(true);
  });
});

describe('isRlsDeniedError — message "row-level security"', () => {
  it('returns true for exact phrase', () => {
    expect(isRlsDeniedError({ message: 'row-level security policy violated' })).toBe(true);
  });

  it('returns true for mixed case', () => {
    expect(isRlsDeniedError({ message: 'Row-Level Security violation' })).toBe(true);
  });
});

describe('isRlsDeniedError — message "permission denied"', () => {
  it('returns true for "permission denied"', () => {
    expect(isRlsDeniedError({ message: 'permission denied for table transfers' })).toBe(true);
  });

  it('returns true for mixed case', () => {
    expect(isRlsDeniedError({ message: 'Permission Denied' })).toBe(true);
  });
});

describe('isRlsDeniedError — non-matching messages', () => {
  it('returns false for an empty message', () => {
    expect(isRlsDeniedError({ message: '' })).toBe(false);
  });

  it('returns false for a generic error message', () => {
    expect(isRlsDeniedError({ message: 'something went wrong' })).toBe(false);
  });

  it('returns false for a network error message', () => {
    expect(isRlsDeniedError({ message: 'network timeout' })).toBe(false);
  });

  it('returns false for an object with no matching fields', () => {
    expect(isRlsDeniedError({ foo: 'bar' })).toBe(false);
  });
});

// ── isRlsDeniedError — combined fields ───────────────────────────────────────

describe('isRlsDeniedError — combined fields', () => {
  it('returns true when code matches even if status and message do not', () => {
    expect(isRlsDeniedError({ code: '42501', status: 200, message: 'ok' })).toBe(true);
  });

  it('returns true when status matches even if code does not', () => {
    expect(isRlsDeniedError({ code: '00000', status: 403, message: 'ok' })).toBe(true);
  });

  it('returns true when message matches even if code and status do not', () => {
    expect(isRlsDeniedError({ code: '00000', status: 200, message: 'forbidden' })).toBe(true);
  });
});

// ── rlsDeniedMessage ──────────────────────────────────────────────────────────

describe('rlsDeniedMessage', () => {
  it('returns a non-empty string', () => {
    const msg = rlsDeniedMessage('DLQ');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('includes the resource name in the message', () => {
    expect(rlsDeniedMessage('DLQ')).toContain('DLQ');
    expect(rlsDeniedMessage('transferências')).toContain('transferências');
    expect(rlsDeniedMessage('auditoria')).toContain('auditoria');
  });

  it('message contains "Acesso negado" (Portuguese access denial)', () => {
    expect(rlsDeniedMessage('DLQ')).toContain('Acesso negado');
  });

  it('message mentions admin or supervisor', () => {
    const msg = rlsDeniedMessage('DLQ').toLowerCase();
    const mentionsPrivilege = msg.includes('administrador') || msg.includes('supervisor');
    expect(mentionsPrivilege).toBe(true);
  });

  it('returns different messages for different resources', () => {
    expect(rlsDeniedMessage('DLQ')).not.toBe(rlsDeniedMessage('Transfers'));
  });
});

// ── formatAdminError — RLS error ──────────────────────────────────────────────

describe('formatAdminError — RLS errors', () => {
  it('returns rlsDeniedMessage for code 42501', () => {
    const result = formatAdminError({ code: '42501' }, 'DLQ');
    expect(result).toBe(rlsDeniedMessage('DLQ'));
  });

  it('returns rlsDeniedMessage for status 403', () => {
    const result = formatAdminError({ status: 403 }, 'Transfers');
    expect(result).toBe(rlsDeniedMessage('Transfers'));
  });

  it('returns rlsDeniedMessage when message contains "forbidden"', () => {
    const result = formatAdminError({ message: 'forbidden' }, 'Audit');
    expect(result).toBe(rlsDeniedMessage('Audit'));
  });

  it('includes the resource name in the output for RLS errors', () => {
    expect(formatAdminError({ code: '42501' }, 'MyResource')).toContain('MyResource');
  });
});

// ── formatAdminError — Error instances ───────────────────────────────────────

describe('formatAdminError — Error instances', () => {
  it('returns error.message for a plain Error', () => {
    const err = new Error('something failed');
    expect(formatAdminError(err, 'DLQ')).toBe('something failed');
  });

  it('returns error.message for a TypeError', () => {
    const err = new TypeError('invalid type');
    expect(formatAdminError(err, 'DLQ')).toBe('invalid type');
  });

  it('does NOT include the resource name for generic Error', () => {
    const err = new Error('totally different message');
    const result = formatAdminError(err, 'MyResource');
    expect(result).toBe('totally different message');
  });
});

// ── formatAdminError — unknown / falsy values ─────────────────────────────────

describe('formatAdminError — unknown values', () => {
  it('returns a fallback string for null', () => {
    const result = formatAdminError(null, 'DLQ');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a fallback string for undefined', () => {
    const result = formatAdminError(undefined, 'DLQ');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a fallback string for a plain string', () => {
    const result = formatAdminError('something broke', 'DLQ');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('fallback includes the resource name', () => {
    expect(formatAdminError(null, 'SpecialResource')).toContain('SpecialResource');
  });

  it('returns a fallback string for a number', () => {
    const result = formatAdminError(500, 'DLQ');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
