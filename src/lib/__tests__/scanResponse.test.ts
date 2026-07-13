import { describe, it, expect } from 'vitest';
import {
  isBlocking,
  isRetryable,
  isInputError,
  ScanBlockedError,
} from '@/lib/scanResponse';
import type { ScanResult, ScanSuccess, ScanError } from '@/lib/scanResponse';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSuccess(overrides: Partial<ScanSuccess> = {}): ScanSuccess {
  return {
    status: 'success',
    verdict: 'clean',
    scanId: 'scan-001',
    message: 'File is clean.',
    payload: {},
    ...overrides,
  };
}

function makeError(code: ScanError['code'], overrides: Partial<ScanError> = {}): ScanError {
  return {
    status: 'error',
    code,
    message: `Error: ${code}`,
    verdict: 'unknown',
    scanId: null,
    ...overrides,
  };
}

// ── isBlocking ────────────────────────────────────────────────────────────────

describe('isBlocking', () => {
  it('returns true for MALWARE_DETECTED', () => {
    expect(isBlocking(makeError('MALWARE_DETECTED'))).toBe(true);
  });

  it('returns true for SUSPICIOUS_FILE', () => {
    expect(isBlocking(makeError('SUSPICIOUS_FILE'))).toBe(true);
  });

  it('returns false for SCAN_TIMEOUT', () => {
    expect(isBlocking(makeError('SCAN_TIMEOUT'))).toBe(false);
  });

  it('returns false for SCAN_UNAVAILABLE', () => {
    expect(isBlocking(makeError('SCAN_UNAVAILABLE'))).toBe(false);
  });

  it('returns false for INVALID_INPUT', () => {
    expect(isBlocking(makeError('INVALID_INPUT'))).toBe(false);
  });

  it('returns false for METHOD_NOT_ALLOWED', () => {
    expect(isBlocking(makeError('METHOD_NOT_ALLOWED'))).toBe(false);
  });

  it('returns false for NETWORK_ERROR', () => {
    expect(isBlocking(makeError('NETWORK_ERROR'))).toBe(false);
  });

  it('returns false for UNAUTHORIZED', () => {
    expect(isBlocking(makeError('UNAUTHORIZED'))).toBe(false);
  });

  it('returns false for STORAGE_ERROR', () => {
    expect(isBlocking(makeError('STORAGE_ERROR'))).toBe(false);
  });

  it('returns false for INTERNAL_ERROR', () => {
    expect(isBlocking(makeError('INTERNAL_ERROR'))).toBe(false);
  });

  it('returns false for UNKNOWN', () => {
    expect(isBlocking(makeError('UNKNOWN'))).toBe(false);
  });

  it('returns false for a success result', () => {
    expect(isBlocking(makeSuccess())).toBe(false);
  });

  it('narrows type correctly (TypeScript guard)', () => {
    const r: ScanResult = makeError('MALWARE_DETECTED');
    if (isBlocking(r)) {
      expect(['MALWARE_DETECTED', 'SUSPICIOUS_FILE']).toContain(r.code);
    }
  });
});

// ── isRetryable ───────────────────────────────────────────────────────────────

describe('isRetryable', () => {
  it('returns true for SCAN_TIMEOUT', () => {
    expect(isRetryable(makeError('SCAN_TIMEOUT'))).toBe(true);
  });

  it('returns true for SCAN_UNAVAILABLE', () => {
    expect(isRetryable(makeError('SCAN_UNAVAILABLE'))).toBe(true);
  });

  it('returns true for NETWORK_ERROR', () => {
    expect(isRetryable(makeError('NETWORK_ERROR'))).toBe(true);
  });

  it('returns false for MALWARE_DETECTED', () => {
    expect(isRetryable(makeError('MALWARE_DETECTED'))).toBe(false);
  });

  it('returns false for SUSPICIOUS_FILE', () => {
    expect(isRetryable(makeError('SUSPICIOUS_FILE'))).toBe(false);
  });

  it('returns false for INVALID_INPUT', () => {
    expect(isRetryable(makeError('INVALID_INPUT'))).toBe(false);
  });

  it('returns false for METHOD_NOT_ALLOWED', () => {
    expect(isRetryable(makeError('METHOD_NOT_ALLOWED'))).toBe(false);
  });

  it('returns false for UNAUTHORIZED', () => {
    expect(isRetryable(makeError('UNAUTHORIZED'))).toBe(false);
  });

  it('returns false for STORAGE_ERROR', () => {
    expect(isRetryable(makeError('STORAGE_ERROR'))).toBe(false);
  });

  it('returns false for INTERNAL_ERROR', () => {
    expect(isRetryable(makeError('INTERNAL_ERROR'))).toBe(false);
  });

  it('returns false for UNKNOWN', () => {
    expect(isRetryable(makeError('UNKNOWN'))).toBe(false);
  });

  it('returns false for a success result', () => {
    expect(isRetryable(makeSuccess())).toBe(false);
  });

  it('narrows type correctly (TypeScript guard)', () => {
    const r: ScanResult = makeError('SCAN_TIMEOUT');
    if (isRetryable(r)) {
      expect(['SCAN_TIMEOUT', 'SCAN_UNAVAILABLE', 'NETWORK_ERROR']).toContain(r.code);
    }
  });
});

// ── isInputError ──────────────────────────────────────────────────────────────

describe('isInputError', () => {
  it('returns true for INVALID_INPUT', () => {
    expect(isInputError(makeError('INVALID_INPUT'))).toBe(true);
  });

  it('returns true for METHOD_NOT_ALLOWED', () => {
    expect(isInputError(makeError('METHOD_NOT_ALLOWED'))).toBe(true);
  });

  it('returns false for MALWARE_DETECTED', () => {
    expect(isInputError(makeError('MALWARE_DETECTED'))).toBe(false);
  });

  it('returns false for SUSPICIOUS_FILE', () => {
    expect(isInputError(makeError('SUSPICIOUS_FILE'))).toBe(false);
  });

  it('returns false for SCAN_TIMEOUT', () => {
    expect(isInputError(makeError('SCAN_TIMEOUT'))).toBe(false);
  });

  it('returns false for SCAN_UNAVAILABLE', () => {
    expect(isInputError(makeError('SCAN_UNAVAILABLE'))).toBe(false);
  });

  it('returns false for NETWORK_ERROR', () => {
    expect(isInputError(makeError('NETWORK_ERROR'))).toBe(false);
  });

  it('returns false for UNAUTHORIZED', () => {
    expect(isInputError(makeError('UNAUTHORIZED'))).toBe(false);
  });

  it('returns false for STORAGE_ERROR', () => {
    expect(isInputError(makeError('STORAGE_ERROR'))).toBe(false);
  });

  it('returns false for INTERNAL_ERROR', () => {
    expect(isInputError(makeError('INTERNAL_ERROR'))).toBe(false);
  });

  it('returns false for UNKNOWN', () => {
    expect(isInputError(makeError('UNKNOWN'))).toBe(false);
  });

  it('returns false for a success result', () => {
    expect(isInputError(makeSuccess())).toBe(false);
  });

  it('narrows type correctly (TypeScript guard)', () => {
    const r: ScanResult = makeError('METHOD_NOT_ALLOWED');
    if (isInputError(r)) {
      expect(['INVALID_INPUT', 'METHOD_NOT_ALLOWED']).toContain(r.code);
    }
  });
});

// ── mutual exclusion between guard functions ───────────────────────────────────

describe('guard mutual exclusion', () => {
  it('blocking codes are not retryable', () => {
    for (const code of ['MALWARE_DETECTED', 'SUSPICIOUS_FILE'] as const) {
      const r = makeError(code);
      expect(isBlocking(r)).toBe(true);
      expect(isRetryable(r)).toBe(false);
      expect(isInputError(r)).toBe(false);
    }
  });

  it('retryable codes are not blocking or input errors', () => {
    for (const code of ['SCAN_TIMEOUT', 'SCAN_UNAVAILABLE', 'NETWORK_ERROR'] as const) {
      const r = makeError(code);
      expect(isRetryable(r)).toBe(true);
      expect(isBlocking(r)).toBe(false);
      expect(isInputError(r)).toBe(false);
    }
  });

  it('input error codes are not blocking or retryable', () => {
    for (const code of ['INVALID_INPUT', 'METHOD_NOT_ALLOWED'] as const) {
      const r = makeError(code);
      expect(isInputError(r)).toBe(true);
      expect(isBlocking(r)).toBe(false);
      expect(isRetryable(r)).toBe(false);
    }
  });

  it('uncategorized codes return false for all guards', () => {
    for (const code of ['UNAUTHORIZED', 'STORAGE_ERROR', 'INTERNAL_ERROR', 'UNKNOWN'] as const) {
      const r = makeError(code);
      expect(isBlocking(r)).toBe(false);
      expect(isRetryable(r)).toBe(false);
      expect(isInputError(r)).toBe(false);
    }
  });

  it('success result returns false for all guards', () => {
    const r = makeSuccess();
    expect(isBlocking(r)).toBe(false);
    expect(isRetryable(r)).toBe(false);
    expect(isInputError(r)).toBe(false);
  });
});

// ── ScanBlockedError ──────────────────────────────────────────────────────────

describe('ScanBlockedError', () => {
  it('is an instance of Error', () => {
    const err = new ScanBlockedError(makeError('MALWARE_DETECTED'));
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of ScanBlockedError', () => {
    const err = new ScanBlockedError(makeError('MALWARE_DETECTED'));
    expect(err).toBeInstanceOf(ScanBlockedError);
  });

  it('has name ScanBlockedError', () => {
    const err = new ScanBlockedError(makeError('MALWARE_DETECTED'));
    expect(err.name).toBe('ScanBlockedError');
  });

  it('uses the scan error message as Error.message', () => {
    const result = makeError('MALWARE_DETECTED', { message: 'File contains malware.' });
    const err = new ScanBlockedError(result);
    expect(err.message).toBe('File contains malware.');
  });

  it('falls back to generic message for a success result', () => {
    const err = new ScanBlockedError(makeSuccess());
    expect(err.message).toBe('Scan error');
  });

  it('exposes the result property', () => {
    const result = makeError('SUSPICIOUS_FILE');
    const err = new ScanBlockedError(result);
    expect(err.result).toBe(result);
  });

  it('result.status is preserved', () => {
    const result = makeError('MALWARE_DETECTED');
    const err = new ScanBlockedError(result);
    expect(err.result.status).toBe('error');
  });

  it('result.code is preserved', () => {
    const result = makeError('SUSPICIOUS_FILE');
    const err = new ScanBlockedError(result);
    if (err.result.status === 'error') {
      expect(err.result.code).toBe('SUSPICIOUS_FILE');
    }
  });

  it('can wrap a success result (edge case)', () => {
    const result = makeSuccess({ message: 'ok' });
    const err = new ScanBlockedError(result);
    expect(err.result).toBe(result);
    expect(err.message).toBe('Scan error');
  });

  it('has a stack trace', () => {
    const err = new ScanBlockedError(makeError('MALWARE_DETECTED'));
    expect(err.stack).toBeTruthy();
  });

  it('can be thrown and caught as Error', () => {
    const result = makeError('MALWARE_DETECTED', { message: 'Malware found.' });
    expect(() => { throw new ScanBlockedError(result); }).toThrow('Malware found.');
  });

  it('can be caught as ScanBlockedError', () => {
    const result = makeError('SUSPICIOUS_FILE');
    let caught: unknown;
    try {
      throw new ScanBlockedError(result);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ScanBlockedError);
  });
});
