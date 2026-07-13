/**
 * Tests for pure exports from useCampaignEditor.ts.
 *
 * No mocks needed — all targets are either pure functions or static data arrays.
 *
 *   toLocalDateTimeInput(value: string)
 *     — converts an ISO/UTC string to the "YYYY-MM-DDTHH:mm" format that
 *       <input type="datetime-local"> expects, in the browser's LOCAL time.
 *       Invalid dates return ''.
 *
 *   VARIABLES
 *     — static array of template variable descriptors.
 *
 *   MESSAGE_TEMPLATES
 *     — static array of pre-built message templates.
 *
 *   MEDIA_TYPES
 *     — static array of supported media type options.
 *
 * Covered:
 *   toLocalDateTimeInput
 *     - empty string → ''  (NaN guard)
 *     - non-date string → '' (NaN guard)
 *     - ISO string in UTC → local YYYY-MM-DDTHH:mm (round-trip via local Date constructor)
 *     - single-digit month, day, hour, minute → zero-padded
 *     - December 31, midnight → correct date (boundary)
 *     - result always matches YYYY-MM-DDTHH:mm format
 *   VARIABLES
 *     - has exactly 5 entries
 *     - every entry has key, label, desc
 *     - all keys use {{…}} mustache syntax
 *     - keys are unique
 *   MESSAGE_TEMPLATES
 *     - has exactly 6 entries
 *     - every entry has name and template
 *     - names are unique
 *   MEDIA_TYPES
 *     - has exactly 4 entries
 *     - every entry has value, label, icon
 *     - values are unique
 */
import { describe, it, expect } from 'vitest';
import {
  toLocalDateTimeInput,
  VARIABLES,
  MESSAGE_TEMPLATES,
  MEDIA_TYPES,
} from '../useCampaignEditor';

// ── toLocalDateTimeInput ──────────────────────────────────────────────────

describe('toLocalDateTimeInput — NaN guard', () => {
  it('returns "" for an empty string', () => {
    expect(toLocalDateTimeInput('')).toBe('');
  });

  it('returns "" for a non-date string', () => {
    expect(toLocalDateTimeInput('not-a-date')).toBe('');
  });

  it('returns "" for "undefined" as string', () => {
    expect(toLocalDateTimeInput('undefined')).toBe('');
  });

  it('returns "" for garbage input', () => {
    expect(toLocalDateTimeInput('2025-13-40T99:99')).toBe('');
  });
});

describe('toLocalDateTimeInput — valid date formatting', () => {
  it('round-trips a local date through ISO string without timezone shift', () => {
    // Create a date in LOCAL time, convert to ISO (UTC), then back to local.
    // Output must match the original local time components regardless of timezone.
    const local = new Date(2025, 5, 15, 14, 30, 0); // June 15 14:30 local
    const result = toLocalDateTimeInput(local.toISOString());
    expect(result).toBe('2025-06-15T14:30');
  });

  it('pads single-digit month and day with zeros', () => {
    const local = new Date(2025, 0, 5, 9, 7, 0); // Jan 5 09:07 local
    const result = toLocalDateTimeInput(local.toISOString());
    expect(result).toBe('2025-01-05T09:07');
  });

  it('pads single-digit hours and minutes with zeros', () => {
    const local = new Date(2025, 2, 1, 8, 3, 0); // March 1 08:03 local
    const result = toLocalDateTimeInput(local.toISOString());
    expect(result).toBe('2025-03-01T08:03');
  });

  it('handles midnight correctly (hour 00:00)', () => {
    const local = new Date(2025, 11, 31, 0, 0, 0); // Dec 31 00:00 local
    const result = toLocalDateTimeInput(local.toISOString());
    expect(result).toBe('2025-12-31T00:00');
  });

  it('handles end of day correctly (23:59)', () => {
    const local = new Date(2025, 11, 31, 23, 59, 0); // Dec 31 23:59 local
    const result = toLocalDateTimeInput(local.toISOString());
    expect(result).toBe('2025-12-31T23:59');
  });

  it('always returns a string matching YYYY-MM-DDTHH:mm format', () => {
    const local = new Date(2026, 3, 20, 16, 45, 0);
    const result = toLocalDateTimeInput(local.toISOString());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ── VARIABLES ─────────────────────────────────────────────────────────────

describe('VARIABLES — static array', () => {
  it('has exactly 5 entries', () => {
    expect(VARIABLES).toHaveLength(5);
  });

  it('every entry has key, label, and desc fields', () => {
    for (const v of VARIABLES) {
      expect(v).toHaveProperty('key');
      expect(v).toHaveProperty('label');
      expect(v).toHaveProperty('desc');
    }
  });

  it('all keys use {{…}} mustache double-brace syntax', () => {
    for (const v of VARIABLES) {
      expect(v.key).toMatch(/^\{\{.+\}\}$/);
    }
  });

  it('keys are unique', () => {
    const keys = VARIABLES.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes the {{nome}} variable', () => {
    expect(VARIABLES.some((v) => v.key === '{{nome}}')).toBe(true);
  });

  it('includes the {{saudacao}} variable', () => {
    expect(VARIABLES.some((v) => v.key === '{{saudacao}}')).toBe(true);
  });
});

// ── MESSAGE_TEMPLATES ─────────────────────────────────────────────────────

describe('MESSAGE_TEMPLATES — static array', () => {
  it('has exactly 6 entries', () => {
    expect(MESSAGE_TEMPLATES).toHaveLength(6);
  });

  it('every entry has name and template fields', () => {
    for (const t of MESSAGE_TEMPLATES) {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('template');
      expect(typeof t.name).toBe('string');
      expect(typeof t.template).toBe('string');
    }
  });

  it('names are unique', () => {
    const names = MESSAGE_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('no template is an empty string', () => {
    for (const t of MESSAGE_TEMPLATES) {
      expect(t.template.length).toBeGreaterThan(0);
    }
  });

  it('includes "Saudação simples" template', () => {
    expect(MESSAGE_TEMPLATES.some((t) => t.name === 'Saudação simples')).toBe(true);
  });
});

// ── MEDIA_TYPES ───────────────────────────────────────────────────────────

describe('MEDIA_TYPES — static array', () => {
  it('has exactly 4 entries', () => {
    expect(MEDIA_TYPES).toHaveLength(4);
  });

  it('every entry has value, label, and icon fields', () => {
    for (const m of MEDIA_TYPES) {
      expect(m).toHaveProperty('value');
      expect(m).toHaveProperty('label');
      expect(m).toHaveProperty('icon');
    }
  });

  it('values are unique', () => {
    const values = MEDIA_TYPES.map((m) => m.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('includes "image" type', () => {
    expect(MEDIA_TYPES.some((m) => m.value === 'image')).toBe(true);
  });

  it('includes "video" type', () => {
    expect(MEDIA_TYPES.some((m) => m.value === 'video')).toBe(true);
  });

  it('includes "document" type', () => {
    expect(MEDIA_TYPES.some((m) => m.value === 'document')).toBe(true);
  });

  it('includes "audio" type', () => {
    expect(MEDIA_TYPES.some((m) => m.value === 'audio')).toBe(true);
  });
});
