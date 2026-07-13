import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isRetryableError, withRetry, friendlyErrorMessage } from '../retry';

// ── isRetryableError — non-Error inputs ──────────────────────────────────────

describe('isRetryableError — non-Error inputs', () => {
  it('returns false for null', () => {
    expect(isRetryableError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isRetryableError('network error')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRetryableError(500)).toBe(false);
  });

  it('returns false for a plain object', () => {
    expect(isRetryableError({ message: 'timeout' })).toBe(false);
  });
});

// ── isRetryableError — retryable Error messages ───────────────────────────────

describe('isRetryableError — retryable Error messages', () => {
  const RETRYABLE_MESSAGES = [
    'network connection failed',
    'Request timeout exceeded',
    'Request aborted by user',
    'Failed to fetch',
    'Internal Server Error 500',
    'Service Unavailable 503',
    'Too Many Requests 429',
  ];

  it.each(RETRYABLE_MESSAGES)('returns true for "%s"', (msg) => {
    expect(isRetryableError(new Error(msg))).toBe(true);
  });

  it('is case-insensitive for "NETWORK"', () => {
    expect(isRetryableError(new Error('NETWORK ERROR'))).toBe(true);
  });

  it('is case-insensitive for "TIMEOUT"', () => {
    expect(isRetryableError(new Error('TIMEOUT'))).toBe(true);
  });

  it('matches partial keyword: "timeout" inside a longer message', () => {
    expect(isRetryableError(new Error('operation timeout after 30s'))).toBe(true);
  });
});

// ── isRetryableError — non-retryable Error messages ──────────────────────────

describe('isRetryableError — non-retryable Error messages', () => {
  it('returns false for a generic error', () => {
    expect(isRetryableError(new Error('something went wrong'))).toBe(false);
  });

  it('returns false for an Error with no message', () => {
    expect(isRetryableError(new Error())).toBe(false);
  });

  it('returns false for auth errors', () => {
    expect(isRetryableError(new Error('unauthorized access'))).toBe(false);
  });
});

// ── withRetry — success on first attempt ─────────────────────────────────────

describe('withRetry — success on first attempt', () => {
  it('resolves with the function return value', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── withRetry — throws immediately for non-retryable errors ──────────────────

describe('withRetry — non-retryable errors', () => {
  it('throws immediately without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('unexpected failure'));
    await expect(withRetry(fn, 2, 0)).rejects.toThrow('unexpected failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── withRetry — retries on retryable errors ───────────────────────────────────

describe('withRetry — retryable errors with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries and eventually resolves', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, 2, 10);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fetch failed'));
    // Attach rejects handler first so the rejection is always handled
    const assertion = expect(withRetry(fn, 2, 10)).rejects.toThrow('fetch failed');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

});

// ── withRetry — maxRetries = 0 (no timers needed) ────────────────────────────

describe('withRetry — maxRetries = 0', () => {
  it('throws without retrying even for retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(withRetry(fn, 0, 10)).rejects.toThrow('network error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── friendlyErrorMessage — error message patterns ─────────────────────────────

describe('friendlyErrorMessage — recognized patterns', () => {
  it('returns microphone permission message for "microphone"', () => {
    const msg = friendlyErrorMessage(new Error('microphone access denied'));
    expect(msg).toContain('microfone');
  });

  it('returns microphone permission message for "permission"', () => {
    const msg = friendlyErrorMessage(new Error('permission denied'));
    expect(msg).toContain('microfone');
  });

  it('returns microphone permission message for "notallowed"', () => {
    const msg = friendlyErrorMessage(new Error('NotAllowedError'));
    expect(msg).toContain('microfone');
  });

  it('returns connection message for "network"', () => {
    const msg = friendlyErrorMessage(new Error('network failure'));
    expect(msg).toContain('conexão');
  });

  it('returns connection message for "fetch"', () => {
    const msg = friendlyErrorMessage(new Error('failed to fetch'));
    expect(msg).toContain('conexão');
  });

  it('returns timeout message for "timeout"', () => {
    const msg = friendlyErrorMessage(new Error('timeout exceeded'));
    expect(msg).toContain('demorou');
  });

  it('returns timeout message for "aborted"', () => {
    const msg = friendlyErrorMessage(new Error('request aborted'));
    expect(msg).toContain('demorou');
  });

  it('returns rate limit message for "429"', () => {
    const msg = friendlyErrorMessage(new Error('HTTP 429'));
    expect(msg).toContain('solicitações');
  });

  it('returns rate limit message for "rate limit"', () => {
    const msg = friendlyErrorMessage(new Error('rate limit exceeded'));
    expect(msg).toContain('solicitações');
  });

  it('returns credits message for "credits"', () => {
    const msg = friendlyErrorMessage(new Error('out of credits'));
    expect(msg).toContain('Créditos');
  });

  it('returns credits message for "402"', () => {
    const msg = friendlyErrorMessage(new Error('HTTP 402 Payment Required'));
    expect(msg).toContain('Créditos');
  });

  it('returns session message for "unauthorized"', () => {
    const msg = friendlyErrorMessage(new Error('unauthorized'));
    expect(msg).toContain('expirada');
  });

  it('returns session message for "401"', () => {
    const msg = friendlyErrorMessage(new Error('HTTP 401'));
    expect(msg).toContain('expirada');
  });
});

// ── friendlyErrorMessage — fallback ───────────────────────────────────────────

describe('friendlyErrorMessage — fallback', () => {
  it('returns generic message for an Error with no recognized keyword', () => {
    const msg = friendlyErrorMessage(new Error('something completely unexpected'));
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('returns generic message for a non-Error value', () => {
    const msg = friendlyErrorMessage('plain string');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('returns generic message for null', () => {
    const msg = friendlyErrorMessage(null);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});
