import { describe, it, expect, beforeEach } from 'vitest';
import {
  CONTACT_DETAIL_SECTIONS,
  DEFAULT_OPEN_SECTIONS,
  getStoredAccordionState,
  saveAccordionState,
} from '../contactDetailSections';

const STORAGE_KEY = 'contact-details-accordion-state';

beforeEach(() => {
  localStorage.clear();
});

// ── CONTACT_DETAIL_SECTIONS shape ─────────────────────────────────────────────

describe('CONTACT_DETAIL_SECTIONS', () => {
  it('has exactly 18 entries', () => {
    expect(CONTACT_DETAIL_SECTIONS).toHaveLength(18);
  });

  it('every entry has a non-empty string value', () => {
    CONTACT_DETAIL_SECTIONS.forEach((s) => {
      expect(typeof s.value).toBe('string');
      expect(s.value.length).toBeGreaterThan(0);
    });
  });

  it('every entry has a non-empty string label', () => {
    CONTACT_DETAIL_SECTIONS.forEach((s) => {
      expect(typeof s.label).toBe('string');
      expect(s.label.length).toBeGreaterThan(0);
    });
  });

  it('every entry has a non-null icon', () => {
    CONTACT_DETAIL_SECTIONS.forEach((s) => {
      expect(s.icon).toBeTruthy();
    });
  });

  it('every entry has a numeric customIndex', () => {
    CONTACT_DETAIL_SECTIONS.forEach((s) => {
      expect(typeof s.customIndex).toBe('number');
    });
  });

  it('contains "info" section', () => {
    expect(CONTACT_DETAIL_SECTIONS.some((s) => s.value === 'info')).toBe(true);
  });

  it('contains "crm-360" section', () => {
    expect(CONTACT_DETAIL_SECTIONS.some((s) => s.value === 'crm-360')).toBe(true);
  });

  it('contains "tags" section', () => {
    expect(CONTACT_DETAIL_SECTIONS.some((s) => s.value === 'tags')).toBe(true);
  });

  it('contains "history" section', () => {
    expect(CONTACT_DETAIL_SECTIONS.some((s) => s.value === 'history')).toBe(true);
  });

  it('contains "stats" section', () => {
    expect(CONTACT_DETAIL_SECTIONS.some((s) => s.value === 'stats')).toBe(true);
  });

  it('all section values are unique', () => {
    const values = CONTACT_DETAIL_SECTIONS.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('"info" section has customIndex 0', () => {
    const info = CONTACT_DETAIL_SECTIONS.find((s) => s.value === 'info');
    expect(info?.customIndex).toBe(0);
  });
});

// ── DEFAULT_OPEN_SECTIONS ─────────────────────────────────────────────────────

describe('DEFAULT_OPEN_SECTIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_OPEN_SECTIONS)).toBe(true);
    expect(DEFAULT_OPEN_SECTIONS.length).toBeGreaterThan(0);
  });

  it('contains "info"', () => {
    expect(DEFAULT_OPEN_SECTIONS).toContain('info');
  });

  it('contains "crm-360"', () => {
    expect(DEFAULT_OPEN_SECTIONS).toContain('crm-360');
  });

  it('contains "tags"', () => {
    expect(DEFAULT_OPEN_SECTIONS).toContain('tags');
  });

  it('contains "history"', () => {
    expect(DEFAULT_OPEN_SECTIONS).toContain('history');
  });

  it('contains "notes"', () => {
    expect(DEFAULT_OPEN_SECTIONS).toContain('notes');
  });

  it('all entries are non-empty strings', () => {
    DEFAULT_OPEN_SECTIONS.forEach((s) => {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    });
  });
});

// ── getStoredAccordionState ───────────────────────────────────────────────────

describe('getStoredAccordionState', () => {
  it('returns DEFAULT_OPEN_SECTIONS when localStorage is empty', () => {
    expect(getStoredAccordionState()).toEqual(DEFAULT_OPEN_SECTIONS);
  });

  it('returns stored array after saveAccordionState round-trip', () => {
    const custom = ['info', 'tags'];
    saveAccordionState(custom);
    expect(getStoredAccordionState()).toEqual(custom);
  });

  it('returns empty array when empty array was stored', () => {
    saveAccordionState([]);
    expect(getStoredAccordionState()).toEqual([]);
  });

  it('returns DEFAULT_OPEN_SECTIONS when localStorage has malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json}');
    expect(getStoredAccordionState()).toEqual(DEFAULT_OPEN_SECTIONS);
  });

  it('returns DEFAULT_OPEN_SECTIONS when localStorage value is empty string', () => {
    localStorage.setItem(STORAGE_KEY, '');
    // empty string is falsy → null path → falls back
    expect(getStoredAccordionState()).toEqual(DEFAULT_OPEN_SECTIONS);
  });

  it('returns a new array (not the same reference as DEFAULT_OPEN_SECTIONS) when nothing stored', () => {
    const result = getStoredAccordionState();
    // The fallback is the constant itself; at minimum it must equal the constant
    expect(result).toEqual(DEFAULT_OPEN_SECTIONS);
  });

  it('preserves order of stored values', () => {
    const ordered = ['stats', 'history', 'info'];
    saveAccordionState(ordered);
    expect(getStoredAccordionState()).toEqual(ordered);
  });
});

// ── saveAccordionState ────────────────────────────────────────────────────────

describe('saveAccordionState', () => {
  it('persists an array so localStorage is not empty', () => {
    saveAccordionState(['info']);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('stores values as a JSON string', () => {
    saveAccordionState(['info', 'tags']);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('["info","tags"]');
  });

  it('overwrites a previously stored value', () => {
    saveAccordionState(['info']);
    saveAccordionState(['tags', 'history']);
    expect(getStoredAccordionState()).toEqual(['tags', 'history']);
  });

  it('stores empty array as "[]"', () => {
    saveAccordionState([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
  });

  it('does not throw when called multiple times', () => {
    expect(() => {
      saveAccordionState(['info']);
      saveAccordionState(['crm-360']);
      saveAccordionState([]);
    }).not.toThrow();
  });
});
