import { describe, it, expect } from 'vitest';
import {
  toNumber,
  formatLocaleNumber,
  formatTokens,
  formatPercent,
  formatBRL,
} from '@/lib/rechartsFormatters';

describe('toNumber (recharts)', () => {
  it('returns the number as-is for a numeric input', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-5.5)).toBe(-5.5);
  });

  it('parses a numeric string', () => {
    expect(toNumber('123')).toBe(123);
    expect(toNumber('3.14')).toBe(3.14);
  });

  it('returns 0 for non-numeric string', () => {
    expect(toNumber('abc')).toBe(0);
    expect(toNumber('')).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(toNumber(undefined)).toBe(0);
  });

  it('returns first element for non-empty array', () => {
    expect(toNumber([10, 20, 30])).toBe(10);
  });

  it('returns 0 for empty array', () => {
    expect(toNumber([])).toBe(0);
  });

  it('returns 0 for NaN string', () => {
    expect(toNumber('NaN')).toBe(0);
  });

  it('returns 0 for Infinity (not finite)', () => {
    expect(toNumber('Infinity')).toBe(0);
  });
});

describe('formatLocaleNumber', () => {
  it('formats zero as a locale string', () => {
    expect(formatLocaleNumber(0)).toBe((0).toLocaleString());
  });

  it('formats a regular number', () => {
    expect(formatLocaleNumber(1000)).toBe((1000).toLocaleString());
  });

  it('returns fallback 0 formatted for undefined', () => {
    expect(formatLocaleNumber(undefined)).toBe((0).toLocaleString());
  });

  it('parses string before formatting', () => {
    expect(formatLocaleNumber('500')).toBe((500).toLocaleString());
  });
});

describe('formatTokens', () => {
  it('appends " tokens" to the formatted number', () => {
    expect(formatTokens(0)).toBe(`${(0).toLocaleString()} tokens`);
  });

  it('handles a large value', () => {
    const result = formatTokens(10000);
    expect(result).toContain('tokens');
    expect(result).toContain((10000).toLocaleString());
  });

  it('handles undefined as 0 tokens', () => {
    expect(formatTokens(undefined)).toBe(`${(0).toLocaleString()} tokens`);
  });
});

describe('formatPercent', () => {
  it('formats 0 as "0.0%"', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats 100 as "100.0%"', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });

  it('formats 50.5 with default 1 decimal', () => {
    expect(formatPercent(50.5)).toBe('50.5%');
  });

  it('respects custom digits parameter', () => {
    expect(formatPercent(33.333, 2)).toBe('33.33%');
  });

  it('handles undefined as "0.0%"', () => {
    expect(formatPercent(undefined)).toBe('0.0%');
  });
});

describe('formatBRL', () => {
  it('formats 0 as BRL currency', () => {
    const result = formatBRL(0);
    expect(result).toContain('R$');
  });

  it('formats a positive amount', () => {
    const result = formatBRL(1000);
    expect(result).toContain('R$');
    expect(result).toContain('1');
  });

  it('handles undefined as R$0', () => {
    const result = formatBRL(undefined);
    expect(result).toContain('R$');
  });

  it('handles string input', () => {
    const result = formatBRL('250');
    expect(result).toContain('R$');
  });
});
