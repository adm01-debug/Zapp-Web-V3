import { describe, it, expect } from 'vitest';
import { toValidDate } from '../normalize';

// ── falsy inputs → fallback ───────────────────────────────────────────────────

describe('toValidDate — falsy inputs return fallback', () => {
  it('returns fallback (default: new Date()) for null', () => {
    const fallback = new Date('2024-01-01');
    const result = toValidDate(null, fallback);
    expect(result).toBe(fallback);
  });

  it('returns fallback for undefined', () => {
    const fallback = new Date('2024-01-01');
    expect(toValidDate(undefined, fallback)).toBe(fallback);
  });

  it('returns fallback for 0 (falsy number)', () => {
    const fallback = new Date('2024-06-15');
    expect(toValidDate(0, fallback)).toBe(fallback);
  });

  it('returns fallback for empty string (falsy)', () => {
    const fallback = new Date('2024-06-15');
    expect(toValidDate('', fallback)).toBe(fallback);
  });
});

// ── valid ISO string ──────────────────────────────────────────────────────────

describe('toValidDate — valid ISO string inputs', () => {
  it('parses a full ISO 8601 string', () => {
    const result = toValidDate('2024-03-15T10:30:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result!.getTime())).toBe(false);
  });

  it('returns a Date with the correct year for an ISO string', () => {
    const result = toValidDate('2024-03-15T00:00:00.000Z');
    expect(result!.getUTCFullYear()).toBe(2024);
  });

  it('parses a date-only string', () => {
    const result = toValidDate('2024-03-15');
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result!.getTime())).toBe(false);
  });
});

// ── numeric timestamp ─────────────────────────────────────────────────────────

describe('toValidDate — numeric timestamp inputs', () => {
  it('converts a positive epoch timestamp', () => {
    const ts = 1710460800000; // 2024-03-15 00:00:00 UTC
    const result = toValidDate(ts);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(ts);
  });

  it('converts a string representation of a timestamp', () => {
    const result = toValidDate('1710460800000');
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result!.getTime())).toBe(false);
  });
});

// ── Date instance ─────────────────────────────────────────────────────────────

describe('toValidDate — Date instance inputs', () => {
  it('returns a valid Date for a Date instance input', () => {
    const d = new Date('2024-06-01T12:00:00Z');
    const result = toValidDate(d);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(d.getTime());
  });
});

// ── invalid / NaN inputs → fallback ──────────────────────────────────────────

describe('toValidDate — invalid strings return fallback', () => {
  it('returns fallback for "not a date" string', () => {
    const fallback = new Date('2024-01-01');
    expect(toValidDate('not a date', fallback)).toBe(fallback);
  });

  it('returns fallback for random text', () => {
    const fallback = new Date('2024-01-01');
    expect(toValidDate('hello world', fallback)).toBe(fallback);
  });

  it('returns fallback for NaN-producing input', () => {
    const fallback = new Date('2024-01-01');
    expect(toValidDate('abc123', fallback)).toBe(fallback);
  });
});

// ── custom fallback = null ────────────────────────────────────────────────────

describe('toValidDate — custom null fallback', () => {
  it('returns null when input is null and fallback is null', () => {
    expect(toValidDate(null, null)).toBeNull();
  });

  it('returns null when input is invalid and fallback is null', () => {
    expect(toValidDate('invalid', null)).toBeNull();
  });

  it('returns valid Date and ignores null fallback for valid input', () => {
    const result = toValidDate('2024-01-01', null);
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result!.getTime())).toBe(false);
  });
});
