import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_RETRY_CONFIG,
  RETRY_CONFIG_RANGES,
  RETRY_CONFIG_FIELDS,
  clampToRange,
  validateRetryConfig,
  hasRetryConfigErrors,
  settingKeyFor,
  getRetryConfigSync,
  invalidateRetryConfigCache,
  __resetRetryConfigCache,
  RetryConfigValidationError,
} from '@/lib/retryConfig';

// ── DEFAULT_RETRY_CONFIG ──────────────────────────────────────────────────────
describe('DEFAULT_RETRY_CONFIG', () => {
  it('has maxRetries of 3', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
  });

  it('has positive baseBackoffMs', () => {
    expect(DEFAULT_RETRY_CONFIG.baseBackoffMs).toBeGreaterThan(0);
  });

  it('has maxBackoffMs >= baseBackoffMs', () => {
    expect(DEFAULT_RETRY_CONFIG.maxBackoffMs).toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.baseBackoffMs);
  });

  it('has timeoutMs >= baseBackoffMs', () => {
    expect(DEFAULT_RETRY_CONFIG.timeoutMs).toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.baseBackoffMs);
  });
});

// ── RETRY_CONFIG_RANGES ───────────────────────────────────────────────────────
describe('RETRY_CONFIG_RANGES', () => {
  it('has a range for each RETRY_CONFIG_FIELDS entry', () => {
    for (const field of RETRY_CONFIG_FIELDS) {
      expect(RETRY_CONFIG_RANGES[field]).toBeDefined();
    }
  });

  it('each range has min < max', () => {
    for (const field of RETRY_CONFIG_FIELDS) {
      const r = RETRY_CONFIG_RANGES[field];
      expect(r.min).toBeLessThan(r.max);
    }
  });
});

// ── clampToRange ──────────────────────────────────────────────────────────────
describe('clampToRange', () => {
  it('returns value unchanged when within range', () => {
    const r = RETRY_CONFIG_RANGES.maxRetries;
    const mid = Math.floor((r.min + r.max) / 2);
    expect(clampToRange('maxRetries', mid)).toBe(mid);
  });

  it('clamps below min to min', () => {
    const r = RETRY_CONFIG_RANGES.maxRetries;
    expect(clampToRange('maxRetries', r.min - 1)).toBe(r.min);
  });

  it('clamps above max to max', () => {
    const r = RETRY_CONFIG_RANGES.maxRetries;
    expect(clampToRange('maxRetries', r.max + 1)).toBe(r.max);
  });

  it('returns default value for Infinity', () => {
    expect(clampToRange('maxRetries', Infinity)).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
  });

  it('returns default value for NaN', () => {
    expect(clampToRange('maxRetries', NaN)).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
  });

  it('floors fractional values', () => {
    const r = RETRY_CONFIG_RANGES.baseBackoffMs;
    const mid = Math.floor((r.min + r.max) / 2);
    expect(clampToRange('baseBackoffMs', mid + 0.9)).toBe(mid);
  });
});

// ── validateRetryConfig ───────────────────────────────────────────────────────
describe('validateRetryConfig', () => {
  it('returns empty object for valid config', () => {
    expect(validateRetryConfig(DEFAULT_RETRY_CONFIG)).toEqual({});
  });

  it('returns error when maxBackoffMs < baseBackoffMs', () => {
    const bad = { ...DEFAULT_RETRY_CONFIG, maxBackoffMs: 100, baseBackoffMs: 800 };
    const errors = validateRetryConfig(bad);
    expect(errors.maxBackoffMs).toBeTruthy();
  });

  it('returns error when timeoutMs < baseBackoffMs', () => {
    const bad = { ...DEFAULT_RETRY_CONFIG, timeoutMs: 100, baseBackoffMs: 800 };
    const errors = validateRetryConfig(bad);
    expect(errors.timeoutMs).toBeTruthy();
  });

  it('returns error when maxRetries < 1', () => {
    const bad = { ...DEFAULT_RETRY_CONFIG, maxRetries: 0 };
    const errors = validateRetryConfig(bad);
    expect(errors.maxRetries).toBeTruthy();
  });

  it('returns no error for valid boundary (maxBackoff === baseBackoff)', () => {
    const c = {
      ...DEFAULT_RETRY_CONFIG,
      baseBackoffMs: 1000,
      maxBackoffMs: 1000,
      timeoutMs: 30_000,
    };
    expect(validateRetryConfig(c)).toEqual({});
  });

  it('accumulates multiple errors', () => {
    const bad = {
      maxRetries: 0,
      baseBackoffMs: 800,
      maxBackoffMs: 100, // < baseBackoff
      timeoutMs: 100,   // < baseBackoff
    };
    const errors = validateRetryConfig(bad);
    expect(Object.keys(errors).length).toBeGreaterThan(1);
  });
});

// ── hasRetryConfigErrors ──────────────────────────────────────────────────────
describe('hasRetryConfigErrors', () => {
  it('returns false for empty error object', () => {
    expect(hasRetryConfigErrors({})).toBe(false);
  });

  it('returns true when errors are present', () => {
    expect(hasRetryConfigErrors({ maxRetries: 'error' })).toBe(true);
  });

  it('returns true when _form error is present', () => {
    expect(hasRetryConfigErrors({ _form: 'form error' })).toBe(true);
  });
});

// ── settingKeyFor ─────────────────────────────────────────────────────────────
describe('settingKeyFor', () => {
  it('returns global key when no instance name given', () => {
    expect(settingKeyFor('maxRetries')).toBe('retry.global.maxRetries');
  });

  it('returns instance key when instance name is given', () => {
    expect(settingKeyFor('baseBackoffMs', 'myInstance')).toBe('retry.instance.myInstance.baseBackoffMs');
  });

  it('returns global key when instanceName is the sentinel value', () => {
    expect(settingKeyFor('timeoutMs', '_global')).toBe('retry.global.timeoutMs');
  });
});

// ── getRetryConfigSync ────────────────────────────────────────────────────────
describe('getRetryConfigSync', () => {
  beforeEach(() => {
    __resetRetryConfigCache();
  });

  it('returns defaults when cache is empty', () => {
    const result = getRetryConfigSync();
    expect(result).toEqual(DEFAULT_RETRY_CONFIG);
  });

  it('returns defaults for unknown instance when cache is empty', () => {
    const result = getRetryConfigSync('myInstance');
    expect(result).toEqual(DEFAULT_RETRY_CONFIG);
  });

  it('returns a new object (not mutating the default)', () => {
    const a = getRetryConfigSync();
    const b = getRetryConfigSync();
    expect(a).not.toBe(b);
  });
});

// ── invalidateRetryConfigCache ────────────────────────────────────────────────
describe('invalidateRetryConfigCache', () => {
  beforeEach(() => {
    __resetRetryConfigCache();
  });

  it('does not throw when cache is empty', () => {
    expect(() => invalidateRetryConfigCache()).not.toThrow();
  });

  it('does not throw when instance name is provided', () => {
    expect(() => invalidateRetryConfigCache('myInstance')).not.toThrow();
  });
});

// ── RetryConfigValidationError ────────────────────────────────────────────────
describe('RetryConfigValidationError', () => {
  it('is an instance of Error', () => {
    const err = new RetryConfigValidationError({ maxRetries: 'must be >= 1' });
    expect(err).toBeInstanceOf(Error);
  });

  it('has name RetryConfigValidationError', () => {
    const err = new RetryConfigValidationError({ maxRetries: 'must be >= 1' });
    expect(err.name).toBe('RetryConfigValidationError');
  });

  it('uses the first error message as the Error message', () => {
    const err = new RetryConfigValidationError({ maxRetries: 'must be >= 1' });
    expect(err.message).toBe('must be >= 1');
  });

  it('exposes the errors object', () => {
    const errors = { maxRetries: 'must be >= 1', maxBackoffMs: 'too small' };
    const err = new RetryConfigValidationError(errors);
    expect(err.errors).toEqual(errors);
  });

  it('handles empty errors gracefully', () => {
    const err = new RetryConfigValidationError({});
    expect(err).toBeInstanceOf(Error);
  });
});

// ── RETRY_CONFIG_FIELDS ───────────────────────────────────────────────────────
describe('RETRY_CONFIG_FIELDS', () => {
  it('contains all 4 expected fields', () => {
    expect(RETRY_CONFIG_FIELDS).toContain('maxRetries');
    expect(RETRY_CONFIG_FIELDS).toContain('baseBackoffMs');
    expect(RETRY_CONFIG_FIELDS).toContain('maxBackoffMs');
    expect(RETRY_CONFIG_FIELDS).toContain('timeoutMs');
  });

  it('has length 4', () => {
    expect(RETRY_CONFIG_FIELDS).toHaveLength(4);
  });
});
