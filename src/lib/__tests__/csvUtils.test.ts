import { describe, it, expect } from 'vitest';
import {
  escapeCsvCell,
  buildCsv,
  parseCsvString,
  getCsvFilename,
  hasEncodingIssues,
} from '@/lib/csvUtils';

// ── escapeCsvCell ─────────────────────────────────────────────────────────────
describe('escapeCsvCell', () => {
  it('wraps a plain string in double quotes', () => {
    expect(escapeCsvCell('hello')).toBe('"hello"');
  });

  it('returns empty string for null', () => {
    expect(escapeCsvCell(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('converts a number to quoted string', () => {
    expect(escapeCsvCell(42)).toBe('"42"');
  });

  it('converts a boolean to quoted string', () => {
    expect(escapeCsvCell(true)).toBe('"true"');
  });

  it('escapes internal double quotes by doubling them', () => {
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
  });

  it('neutralizes = formula injection with TAB prefix', () => {
    const result = escapeCsvCell('=SUM(1+1)');
    expect(result.startsWith('"\t')).toBe(true);
  });

  it('neutralizes + formula injection', () => {
    const result = escapeCsvCell('+cmd|calc');
    expect(result.startsWith('"\t')).toBe(true);
  });

  it('neutralizes - formula injection', () => {
    const result = escapeCsvCell('-2+3');
    expect(result.startsWith('"\t')).toBe(true);
  });

  it('neutralizes @ formula injection', () => {
    const result = escapeCsvCell('@SUM');
    expect(result.startsWith('"\t')).toBe(true);
  });

  it('does not neutralize a safe string starting with a letter', () => {
    const result = escapeCsvCell('Name');
    expect(result).toBe('"Name"');
  });

  it('handles empty string', () => {
    expect(escapeCsvCell('')).toBe('""');
  });
});

// ── buildCsv ──────────────────────────────────────────────────────────────────
describe('buildCsv', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'age', label: 'Age' },
  ];

  it('starts with UTF-8 BOM', () => {
    const csv = buildCsv([], columns);
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('includes header row with quoted labels', () => {
    const csv = buildCsv([], columns);
    expect(csv).toContain('"Name"');
    expect(csv).toContain('"Age"');
  });

  it('includes data rows', () => {
    const rows = [{ name: 'Alice', age: 30 }];
    const csv = buildCsv(rows, columns);
    expect(csv).toContain('"Alice"');
    expect(csv).toContain('"30"');
  });

  it('separates rows with CRLF', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const csv = buildCsv(rows, columns);
    expect(csv).toContain('\r\n');
  });

  it('uses format function when provided', () => {
    const cols = [
      {
        key: 'amount',
        label: 'Amount',
        format: (v: unknown) => `R$${v}`,
      },
    ];
    const rows = [{ amount: 100 }];
    const csv = buildCsv(rows, cols);
    expect(csv).toContain('R$100');
  });

  it('handles empty rows array', () => {
    const csv = buildCsv([], columns);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines).toHaveLength(2); // header + empty trailing line
  });

  it('handles multiple rows', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Carol', age: 35 },
    ];
    const csv = buildCsv(rows, columns);
    expect(csv).toContain('"Alice"');
    expect(csv).toContain('"Bob"');
    expect(csv).toContain('"Carol"');
  });
});

// ── parseCsvString ────────────────────────────────────────────────────────────
describe('parseCsvString', () => {
  it('returns empty array for empty string', () => {
    expect(parseCsvString('')).toEqual([]);
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsvString('name,age')).toEqual([]);
  });

  it('parses a simple two-column CSV', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = parseCsvString(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice', age: '30' });
    expect(result[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('strips UTF-8 BOM from input', () => {
    const csv = '﻿name,age\nAlice,30';
    const result = parseCsvString(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('handles CRLF line endings', () => {
    const csv = 'name,age\r\nAlice,30\r\nBob,25';
    const result = parseCsvString(csv);
    expect(result).toHaveLength(2);
  });

  it('handles quoted fields with commas inside', () => {
    const csv = 'name,city\n"Smith, John","New York"\nBob,Boston';
    const result = parseCsvString(csv);
    expect(result[0].name).toBe('Smith, John');
    expect(result[0].city).toBe('New York');
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const csv = 'name,quote\nAlice,"say ""hello"""';
    const result = parseCsvString(csv);
    expect(result[0].quote).toBe('say "hello"');
  });

  it('skips empty rows', () => {
    const csv = 'name,age\nAlice,30\n\nBob,25';
    const result = parseCsvString(csv);
    expect(result).toHaveLength(2);
  });

  it('trims header names', () => {
    const csv = ' name , age \nAlice,30';
    const result = parseCsvString(csv);
    expect(Object.keys(result[0])).toContain('name');
  });
});

// ── getCsvFilename ────────────────────────────────────────────────────────────
describe('getCsvFilename', () => {
  it('returns a .csv extension', () => {
    expect(getCsvFilename('contatos')).toMatch(/\.csv$/);
  });

  it('includes the prefix', () => {
    expect(getCsvFilename('contatos')).toContain('contatos');
  });

  it('includes the suffix when provided', () => {
    expect(getCsvFilename('contatos', 'wpp2')).toContain('wpp2');
  });

  it('includes a date-like segment', () => {
    expect(getCsvFilename('export')).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('replaces unsafe characters with underscores', () => {
    const result = getCsvFilename('my export!', 'v1.0');
    // Exclamation mark and space are replaced
    expect(result).not.toContain('!');
    expect(result).not.toContain(' ');
  });
});

// ── hasEncodingIssues ─────────────────────────────────────────────────────────
describe('hasEncodingIssues', () => {
  it('returns false for clean ASCII text', () => {
    expect(hasEncodingIssues('Hello World')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasEncodingIssues('')).toBe(false);
  });

  it('returns true when replacement character U+FFFD is present', () => {
    expect(hasEncodingIssues('text�here')).toBe(true);
  });

  it('returns true for "Ã" mojibake sequence (Ã followed by combining char)', () => {
    expect(hasEncodingIssues('Ã§')).toBe(true);
  });

  it('returns true for "Â" mojibake (Â followed by U+00A0)', () => {
    expect(hasEncodingIssues('Â ')).toBe(true);
  });

  it('returns false for clean Portuguese text without mojibake', () => {
    expect(hasEncodingIssues('João Silva')).toBe(false);
  });
});
