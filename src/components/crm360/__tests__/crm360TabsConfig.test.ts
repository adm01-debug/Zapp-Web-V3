import { describe, it, expect } from 'vitest';
import { formatCellValue, RFM_SEGMENT_COLORS, TABS } from '../crm360TabsConfig';

// ── formatCellValue — null / undefined ────────────────────────────────────────

describe('formatCellValue — null / undefined', () => {
  it('returns "—" for null', () => {
    expect(formatCellValue(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatCellValue(undefined)).toBe('—');
  });

  it('returns "—" for null regardless of format', () => {
    expect(formatCellValue(null, 'date')).toBe('—');
    expect(formatCellValue(null, 'currency')).toBe('—');
    expect(formatCellValue(null, 'boolean')).toBe('—');
    expect(formatCellValue(null, 'number')).toBe('—');
  });
});

// ── formatCellValue — boolean format ─────────────────────────────────────────

describe('formatCellValue — boolean format', () => {
  it('returns "✅" for true', () => {
    expect(formatCellValue(true, 'boolean')).toBe('✅');
  });

  it('returns "❌" for false', () => {
    expect(formatCellValue(false, 'boolean')).toBe('❌');
  });

  it('returns "✅" for truthy non-boolean value with boolean format', () => {
    expect(formatCellValue(1, 'boolean')).toBe('✅');
  });

  it('returns "❌" for 0 with boolean format', () => {
    expect(formatCellValue(0, 'boolean')).toBe('❌');
  });
});

// ── formatCellValue — currency format ─────────────────────────────────────────

describe('formatCellValue — currency format', () => {
  it('formats 1000 as BRL currency string', () => {
    const result = formatCellValue(1000, 'currency');
    expect(result).toContain('1');
    expect(result).toContain('000');
  });

  it('returns a non-empty string for any number with currency format', () => {
    expect(formatCellValue(0, 'currency').length).toBeGreaterThan(0);
    expect(formatCellValue(9999.99, 'currency').length).toBeGreaterThan(0);
  });

  it('does not format non-numbers as currency (falls through to String())', () => {
    const result = formatCellValue('not-a-number', 'currency');
    expect(result).toBe('not-a-number');
  });
});

// ── formatCellValue — number format ───────────────────────────────────────────

describe('formatCellValue — number format', () => {
  it('formats 1000 with pt-BR locale (no currency symbol)', () => {
    const result = formatCellValue(1000, 'number');
    expect(result).toContain('1');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats 0 without errors', () => {
    const result = formatCellValue(0, 'number');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not format strings as number (falls through to String())', () => {
    const result = formatCellValue('42', 'number');
    expect(result).toBe('42');
  });
});

// ── formatCellValue — date format ─────────────────────────────────────────────

describe('formatCellValue — date format', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatCellValue('2024-01-15T10:00:00Z', 'date');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back to the original string for an invalid date', () => {
    const result = formatCellValue('not-a-date', 'date');
    expect(result).toBe('not-a-date');
  });

  it('returns a non-empty string for a date string without time', () => {
    const result = formatCellValue('2023-06-01', 'date');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── formatCellValue — object ──────────────────────────────────────────────────

describe('formatCellValue — object', () => {
  it('JSON.stringifies a plain object', () => {
    const obj = { a: 1, b: 'hello' };
    const result = formatCellValue(obj);
    expect(result).toBe(JSON.stringify(obj));
  });

  it('JSON.stringifies an array', () => {
    const arr = [1, 2, 3];
    const result = formatCellValue(arr);
    expect(result).toBe(JSON.stringify(arr));
  });

  it('JSON.stringifies an empty object', () => {
    expect(formatCellValue({})).toBe('{}');
  });
});

// ── formatCellValue — string / number passthrough ────────────────────────────

describe('formatCellValue — string / number passthrough', () => {
  it('returns a plain string as-is (no format)', () => {
    expect(formatCellValue('hello')).toBe('hello');
  });

  it('converts a number to string (no format)', () => {
    expect(formatCellValue(42)).toBe('42');
  });

  it('returns an empty string as-is', () => {
    expect(formatCellValue('')).toBe('');
  });

  it('returns "true" for boolean true without format', () => {
    expect(formatCellValue(true)).toBe('true');
  });

  it('returns "false" for boolean false without format', () => {
    expect(formatCellValue(false)).toBe('false');
  });
});

// ── RFM_SEGMENT_COLORS — structure ────────────────────────────────────────────

describe('RFM_SEGMENT_COLORS — structure', () => {
  it('is a non-null object', () => {
    expect(typeof RFM_SEGMENT_COLORS).toBe('object');
    expect(RFM_SEGMENT_COLORS).not.toBeNull();
  });

  it('has exactly 6 keys', () => {
    expect(Object.keys(RFM_SEGMENT_COLORS)).toHaveLength(6);
  });

  it('all values are non-empty strings', () => {
    Object.values(RFM_SEGMENT_COLORS).forEach((v) => {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    });
  });

  it('contains key "Champions"', () => {
    expect(RFM_SEGMENT_COLORS['Champions']).toBeDefined();
  });

  it('"Champions" value references success color', () => {
    expect(RFM_SEGMENT_COLORS['Champions']).toContain('success');
  });

  it('contains key "Loyal Customers"', () => {
    expect(RFM_SEGMENT_COLORS['Loyal Customers']).toBeDefined();
  });

  it('"Loyal Customers" value references info color', () => {
    expect(RFM_SEGMENT_COLORS['Loyal Customers']).toContain('info');
  });

  it('contains key "Potential Loyalist"', () => {
    expect(RFM_SEGMENT_COLORS['Potential Loyalist']).toBeDefined();
  });

  it('contains key "At Risk"', () => {
    expect(RFM_SEGMENT_COLORS['At Risk']).toBeDefined();
  });

  it('"At Risk" value references destructive color', () => {
    expect(RFM_SEGMENT_COLORS['At Risk']).toContain('destructive');
  });

  it('contains key "Hibernating"', () => {
    expect(RFM_SEGMENT_COLORS['Hibernating']).toBeDefined();
  });

  it('"Hibernating" value references muted color', () => {
    expect(RFM_SEGMENT_COLORS['Hibernating']).toContain('muted');
  });

  it('contains key "Lost"', () => {
    expect(RFM_SEGMENT_COLORS['Lost']).toBeDefined();
  });

  it('"Lost" value references muted color', () => {
    expect(RFM_SEGMENT_COLORS['Lost']).toContain('muted');
  });
});

// ── TABS — structure ──────────────────────────────────────────────────────────

describe('TABS — structure', () => {
  it('is an array', () => {
    expect(Array.isArray(TABS)).toBe(true);
  });

  it('has more than 10 entries', () => {
    expect(TABS.length).toBeGreaterThan(10);
  });

  it('all tab ids are unique', () => {
    const ids = TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tab has a non-empty id', () => {
    TABS.forEach((t) => {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
    });
  });

  it('every tab has a non-empty label', () => {
    TABS.forEach((t) => {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
    });
  });

  it('every tab has a truthy icon', () => {
    TABS.forEach((t) => {
      expect(t.icon).toBeTruthy();
    });
  });

  it('every tab has a non-empty description', () => {
    TABS.forEach((t) => {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
    });
  });

  it('every tab has a non-empty columns array', () => {
    TABS.forEach((t) => {
      expect(Array.isArray(t.columns)).toBe(true);
      expect(t.columns.length).toBeGreaterThan(0);
    });
  });

  it('every column has non-empty key and label', () => {
    TABS.forEach((t) => {
      t.columns.forEach((c) => {
        expect(typeof c.key).toBe('string');
        expect(c.key.length).toBeGreaterThan(0);
        expect(typeof c.label).toBe('string');
        expect(c.label.length).toBeGreaterThan(0);
      });
    });
  });

  it('column format values are valid when present', () => {
    const VALID_FORMATS = ['date', 'currency', 'boolean', 'number', undefined];
    TABS.forEach((t) => {
      t.columns.forEach((c) => {
        expect(VALID_FORMATS).toContain(c.format);
      });
    });
  });

  it('contains tab with id "companies"', () => {
    expect(TABS.some((t) => t.id === 'companies')).toBe(true);
  });

  it('"companies" tab has label "Empresas"', () => {
    const t = TABS.find((t) => t.id === 'companies')!;
    expect(t.label).toBe('Empresas');
  });

  it('contains tab with id "contacts"', () => {
    expect(TABS.some((t) => t.id === 'contacts')).toBe(true);
  });

  it('contains tab with id "leads"', () => {
    expect(TABS.some((t) => t.id === 'leads')).toBe(true);
  });
});
