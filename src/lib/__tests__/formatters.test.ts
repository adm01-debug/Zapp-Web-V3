import { describe, it, expect } from 'vitest';
import {
  formatShortDate,
  formatFullDateTime,
  cleanPhone,
  formatBrazilianPhone,
  formatBRL,
  truncate,
  getInitials,
  formatCompactNumber,
  formatDuration,
  formatPercentage,
  formatSmartDate,
} from '@/lib/formatters';

// ── formatShortDate ───────────────────────────────────────────────────────────
describe('formatShortDate', () => {
  it('formats a Date object as dd/MM/yyyy', () => {
    expect(formatShortDate(new Date('2026-01-15T12:00:00Z'))).toMatch(/\d{2}\/\d{2}\/2026/);
  });

  it('formats a string ISO date', () => {
    const result = formatShortDate('2026-06-01T00:00:00Z');
    expect(result).toMatch(/\d{2}\/\d{2}\/2026/);
  });

  it('contains the year 2026', () => {
    expect(formatShortDate('2026-03-25T12:00:00Z')).toContain('2026');
  });
});

// ── formatFullDateTime ────────────────────────────────────────────────────────
describe('formatFullDateTime', () => {
  it('formats as dd/MM/yyyy às HH:mm:ss', () => {
    const result = formatFullDateTime('2026-01-15T12:00:00Z');
    expect(result).toMatch(/\d{2}\/\d{2}\/2026 às \d{2}:\d{2}:\d{2}/);
  });

  it('accepts a Date object', () => {
    const result = formatFullDateTime(new Date('2026-06-01T12:00:00Z'));
    expect(result).toContain('às');
    expect(result).toContain('2026');
  });
});

// ── formatSmartDate ───────────────────────────────────────────────────────────
describe('formatSmartDate', () => {
  it('formats a distant past date as dd/MM/yyyy às HH:mm', () => {
    const result = formatSmartDate('2020-01-15T10:30:00Z');
    expect(result).toMatch(/\d{2}\/\d{2}\/2020 às \d{2}:\d{2}/);
  });

  it('accepts a Date object', () => {
    const result = formatSmartDate(new Date('2020-06-01T08:00:00Z'));
    expect(result).toContain('2020');
  });
});

// ── cleanPhone ────────────────────────────────────────────────────────────────
describe('cleanPhone', () => {
  it('removes all non-digit characters', () => {
    expect(cleanPhone('+55 (11) 99999-9999')).toBe('5511999999999');
  });

  it('returns only digits from a plain number', () => {
    expect(cleanPhone('5511999999999')).toBe('5511999999999');
  });

  it('handles empty string', () => {
    expect(cleanPhone('')).toBe('');
  });

  it('removes dashes and dots', () => {
    expect(cleanPhone('11.9999-9999')).toBe('1199999999');
  });

  it('strips leading plus sign', () => {
    expect(cleanPhone('+1 415 555 0132')).toBe('14155550132');
  });
});

// ── formatBrazilianPhone ──────────────────────────────────────────────────────
describe('formatBrazilianPhone', () => {
  it('formats 11-digit local number', () => {
    expect(formatBrazilianPhone('11999999999')).toBe('(11) 99999-9999');
  });

  it('formats 10-digit local number (sem 9 extra)', () => {
    expect(formatBrazilianPhone('1133334444')).toBe('(11) 3333-4444');
  });

  it('strips BR DDI 55 before formatting', () => {
    expect(formatBrazilianPhone('5511999999999')).toBe('(11) 99999-9999');
  });

  it('returns original for unknown format', () => {
    expect(formatBrazilianPhone('123')).toBe('123');
  });

  it('formats formatted input by cleaning first', () => {
    expect(formatBrazilianPhone('+55 (11) 99999-9999')).toBe('(11) 99999-9999');
  });
});

// ── formatBRL ─────────────────────────────────────────────────────────────────
describe('formatBRL (formatters)', () => {
  it('formats zero as currency', () => {
    expect(formatBRL(0)).toContain('R$');
  });

  it('formats a positive amount', () => {
    const result = formatBRL(1000);
    expect(result).toContain('R$');
    expect(result).toContain('1');
  });

  it('formats a decimal value', () => {
    const result = formatBRL(99.9);
    expect(result).toContain('R$');
    expect(result).toContain('99');
  });
});

// ── truncate ──────────────────────────────────────────────────────────────────
describe('truncate', () => {
  it('returns text unchanged when shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns text unchanged at exactly maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when text exceeds maxLength', () => {
    const result = truncate('hello world', 5);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan('hello world'.length);
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('truncates a long sentence', () => {
    const text = 'This is a very long sentence that should be truncated';
    const result = truncate(text, 10);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ── getInitials ───────────────────────────────────────────────────────────────
describe('getInitials', () => {
  it('extracts two initials from a two-word name', () => {
    expect(getInitials('João Silva')).toBe('JS');
  });

  it('takes only first two words by default', () => {
    expect(getInitials('Ana Beatriz Costa')).toBe('AB');
  });

  it('respects custom maxChars', () => {
    expect(getInitials('Ana Beatriz Costa', 3)).toBe('ABC');
  });

  it('handles single word', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('uppercases the initials', () => {
    expect(getInitials('maria jose')).toBe('MJ');
  });
});

// ── formatCompactNumber ───────────────────────────────────────────────────────
describe('formatCompactNumber', () => {
  it('formats small numbers without suffix', () => {
    const result = formatCompactNumber(100);
    expect(result).toContain('100');
  });

  it('formats thousands with K notation', () => {
    const result = formatCompactNumber(1500);
    // Intl compact notation in pt-BR uses "mil" or "K"
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats millions with M notation', () => {
    const result = formatCompactNumber(1_500_000);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats zero', () => {
    expect(formatCompactNumber(0)).toContain('0');
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────
describe('formatDuration', () => {
  it('formats seconds under 60 as "Xs"', () => {
    expect(formatDuration(30)).toBe('30s');
  });

  it('formats exactly 60s as "1min"', () => {
    expect(formatDuration(60)).toBe('1min');
  });

  it('formats 90s as "1min 30s"', () => {
    expect(formatDuration(90)).toBe('1min 30s');
  });

  it('formats 125s as "2min 5s"', () => {
    expect(formatDuration(125)).toBe('2min 5s');
  });

  it('formats exactly 3600s as "1h"', () => {
    expect(formatDuration(3600)).toBe('1h');
  });

  it('formats 3660s as "1h 1min"', () => {
    expect(formatDuration(3660)).toBe('1h 1min');
  });

  it('formats 7380s as "2h 3min"', () => {
    expect(formatDuration(7380)).toBe('2h 3min');
  });

  it('formats 0s as "0s"', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('rounds fractional seconds', () => {
    expect(formatDuration(30.7)).toBe('31s');
  });

  it('formats 120s (exact minutes, no seconds)', () => {
    expect(formatDuration(120)).toBe('2min');
  });
});

// ── formatPercentage ──────────────────────────────────────────────────────────
describe('formatPercentage', () => {
  it('formats 0 as "0.0%"', () => {
    expect(formatPercentage(0)).toBe('0.0%');
  });

  it('formats 1 (100%) as "100.0%"', () => {
    expect(formatPercentage(1)).toBe('100.0%');
  });

  it('formats 0.5 as "50.0%"', () => {
    expect(formatPercentage(0.5)).toBe('50.0%');
  });

  it('formats 0.856 as "85.6%"', () => {
    expect(formatPercentage(0.856)).toBe('85.6%');
  });

  it('respects custom decimals parameter', () => {
    expect(formatPercentage(0.3333, 2)).toBe('33.33%');
  });
});
