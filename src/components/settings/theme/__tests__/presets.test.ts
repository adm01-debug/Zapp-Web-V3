import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  STORAGE_KEY,
  DEFAULT_PRESET_ID,
  CSS_VARS_TO_APPLY,
  normalizeStoredPresetId,
  type ThemeModeColors,
} from '../presets';

// ── STORAGE_KEY ───────────────────────────────────────────────────────────────

describe('STORAGE_KEY', () => {
  it('is a non-empty string', () => {
    expect(typeof STORAGE_KEY).toBe('string');
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
  });

  it('equals "theme-custom-colors"', () => {
    expect(STORAGE_KEY).toBe('theme-custom-colors');
  });
});

// ── DEFAULT_PRESET_ID ─────────────────────────────────────────────────────────

describe('DEFAULT_PRESET_ID', () => {
  it('equals "corporate"', () => {
    expect(DEFAULT_PRESET_ID).toBe('corporate');
  });

  it('refers to a preset that actually exists in PRESETS', () => {
    expect(PRESETS.some((p) => p.id === DEFAULT_PRESET_ID)).toBe(true);
  });
});

// ── CSS_VARS_TO_APPLY ─────────────────────────────────────────────────────────

describe('CSS_VARS_TO_APPLY', () => {
  it('is an array', () => {
    expect(Array.isArray(CSS_VARS_TO_APPLY)).toBe(true);
  });

  it('has 54 entries', () => {
    expect(CSS_VARS_TO_APPLY).toHaveLength(54);
  });

  it('has no duplicate entries', () => {
    const set = new Set(CSS_VARS_TO_APPLY);
    expect(set.size).toBe(CSS_VARS_TO_APPLY.length);
  });

  it('includes "background"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('background');
  });

  it('includes "primary"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('primary');
  });

  it('includes "sidebar-background"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('sidebar-background');
  });

  it('includes "chat-bubble-sent"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('chat-bubble-sent');
  });

  it('includes "gradient-primary"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('gradient-primary');
  });

  it('includes "shadow-glow-primary"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('shadow-glow-primary');
  });

  it('includes "chart-1", "chart-9", "chart-status-open"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('chart-1');
    expect(CSS_VARS_TO_APPLY).toContain('chart-9');
    expect(CSS_VARS_TO_APPLY).toContain('chart-status-open');
  });

  it('includes "glass-bg" and "glass-border"', () => {
    expect(CSS_VARS_TO_APPLY).toContain('glass-bg');
    expect(CSS_VARS_TO_APPLY).toContain('glass-border');
  });
});

// ── PRESETS — completeness ────────────────────────────────────────────────────

describe('PRESETS — completeness', () => {
  it('is an array', () => {
    expect(Array.isArray(PRESETS)).toBe(true);
  });

  it('has 19 presets', () => {
    expect(PRESETS).toHaveLength(19);
  });

  it('all ids are unique', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has a non-empty id', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
    });
  });

  it('every preset has a non-empty name', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    });
  });

  it('every preset has a non-empty description', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.description).toBe('string');
      expect(p.description.length).toBeGreaterThan(0);
    });
  });

  it('every preset has a non-empty emoji', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.emoji).toBe('string');
      expect(p.emoji.length).toBeGreaterThan(0);
    });
  });

  it('every preset has a swatches array of length 4', () => {
    PRESETS.forEach((p) => {
      expect(Array.isArray(p.swatches)).toBe(true);
      expect(p.swatches).toHaveLength(4);
    });
  });

  it('every swatch is a non-empty string', () => {
    PRESETS.forEach((p) => {
      p.swatches.forEach((swatch) => {
        expect(typeof swatch).toBe('string');
        expect(swatch.length).toBeGreaterThan(0);
      });
    });
  });

  it('every preset has a "light" object', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.light).toBe('object');
      expect(p.light).not.toBeNull();
    });
  });

  it('every preset has a "dark" object', () => {
    PRESETS.forEach((p) => {
      expect(typeof p.dark).toBe('object');
      expect(p.dark).not.toBeNull();
    });
  });
});

// ── PRESETS — light/dark mode color completeness ──────────────────────────────

const REQUIRED_COLOR_KEYS: (keyof ThemeModeColors)[] = [
  'background', 'foreground', 'primary', 'primary-foreground',
  'secondary', 'muted', 'accent', 'border', 'card',
  'sidebar-background', 'chat-bubble-sent', 'status-open',
  'gradient-primary', 'shadow-glow-primary',
];

describe('PRESETS — light mode color keys', () => {
  it.each(REQUIRED_COLOR_KEYS)('every preset light mode has key "%s"', (key) => {
    PRESETS.forEach((p) => {
      expect(p.light[key]).toBeDefined();
      expect(typeof p.light[key]).toBe('string');
      expect((p.light[key] as string).length).toBeGreaterThan(0);
    });
  });
});

describe('PRESETS — dark mode color keys', () => {
  it.each(REQUIRED_COLOR_KEYS)('every preset dark mode has key "%s"', (key) => {
    PRESETS.forEach((p) => {
      expect(p.dark[key]).toBeDefined();
      expect(typeof p.dark[key]).toBe('string');
      expect((p.dark[key] as string).length).toBeGreaterThan(0);
    });
  });
});

// ── PRESETS — spot checks ─────────────────────────────────────────────────────

describe('PRESETS — spot checks for standard presets', () => {
  it('contains a preset with id "corporate"', () => {
    expect(PRESETS.some((p) => p.id === 'corporate')).toBe(true);
  });

  it('"corporate" preset has name "Padrão"', () => {
    const p = PRESETS.find((p) => p.id === 'corporate');
    expect(p?.name).toBe('Padrão');
  });

  it('contains a preset with id "emerald"', () => {
    expect(PRESETS.some((p) => p.id === 'emerald')).toBe(true);
  });

  it('contains a preset with id "cyber"', () => {
    expect(PRESETS.some((p) => p.id === 'cyber')).toBe(true);
  });

  it('contains "purpure" preset (deprecated but still present)', () => {
    expect(PRESETS.some((p) => p.id === 'purpure')).toBe(true);
  });
});

describe('PRESETS — spot checks for GX presets', () => {
  it('contains "gx-classic" preset', () => {
    expect(PRESETS.some((p) => p.id === 'gx-classic')).toBe(true);
  });

  it('"gx-classic" preset has a borderRadius defined', () => {
    const p = PRESETS.find((p) => p.id === 'gx-classic');
    expect(p?.borderRadius).toBeDefined();
    expect(typeof p?.borderRadius).toBe('number');
  });

  it('"gx-classic" borderRadius is 4 (sharp corners)', () => {
    const p = PRESETS.find((p) => p.id === 'gx-classic');
    expect(p?.borderRadius).toBe(4);
  });

  it('"gx-classic" has a font defined', () => {
    const p = PRESETS.find((p) => p.id === 'gx-classic');
    expect(typeof p?.font).toBe('string');
    expect((p?.font ?? '').length).toBeGreaterThan(0);
  });

  it('contains "gx-cyberpunk" preset', () => {
    expect(PRESETS.some((p) => p.id === 'gx-cyberpunk')).toBe(true);
  });

  it('contains "gx-razer" preset', () => {
    expect(PRESETS.some((p) => p.id === 'gx-razer')).toBe(true);
  });
});

describe('PRESETS — diversity preset', () => {
  it('contains "diversity" preset', () => {
    expect(PRESETS.some((p) => p.id === 'diversity')).toBe(true);
  });

  it('"diversity" swatches do not all start with the same hue', () => {
    const p = PRESETS.find((p) => p.id === 'diversity')!;
    const unique = new Set(p.swatches);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('PRESETS — standard presets have no borderRadius (use default)', () => {
  it('"corporate" has no borderRadius', () => {
    const p = PRESETS.find((p) => p.id === 'corporate')!;
    expect(p.borderRadius).toBeUndefined();
  });

  it('"emerald" has no borderRadius', () => {
    const p = PRESETS.find((p) => p.id === 'emerald')!;
    expect(p.borderRadius).toBeUndefined();
  });
});

// ── normalizeStoredPresetId — null / undefined / empty ────────────────────────

describe('normalizeStoredPresetId — null / undefined / empty', () => {
  it('returns DEFAULT_PRESET_ID for null', () => {
    expect(normalizeStoredPresetId(null)).toBe(DEFAULT_PRESET_ID);
  });

  it('returns DEFAULT_PRESET_ID for undefined', () => {
    expect(normalizeStoredPresetId(undefined)).toBe(DEFAULT_PRESET_ID);
  });

  it('returns DEFAULT_PRESET_ID for an empty string', () => {
    expect(normalizeStoredPresetId('')).toBe(DEFAULT_PRESET_ID);
  });
});

// ── normalizeStoredPresetId — deprecated IDs ──────────────────────────────────

describe('normalizeStoredPresetId — deprecated IDs', () => {
  it('returns DEFAULT_PRESET_ID for deprecated "default"', () => {
    expect(normalizeStoredPresetId('default')).toBe(DEFAULT_PRESET_ID);
  });

  it('returns DEFAULT_PRESET_ID for deprecated "purpure"', () => {
    expect(normalizeStoredPresetId('purpure')).toBe(DEFAULT_PRESET_ID);
  });
});

// ── normalizeStoredPresetId — valid non-deprecated IDs pass through ───────────

describe('normalizeStoredPresetId — valid IDs pass through', () => {
  it('returns "corporate" for "corporate"', () => {
    expect(normalizeStoredPresetId('corporate')).toBe('corporate');
  });

  it('returns "emerald" for "emerald"', () => {
    expect(normalizeStoredPresetId('emerald')).toBe('emerald');
  });

  it('returns "gx-classic" for "gx-classic"', () => {
    expect(normalizeStoredPresetId('gx-classic')).toBe('gx-classic');
  });

  it('returns "diversity" for "diversity"', () => {
    expect(normalizeStoredPresetId('diversity')).toBe('diversity');
  });

  it('returns "cyber" for "cyber"', () => {
    expect(normalizeStoredPresetId('cyber')).toBe('cyber');
  });
});

// ── normalizeStoredPresetId — unknown IDs fall back ──────────────────────────

describe('normalizeStoredPresetId — unknown IDs fall back', () => {
  it('returns DEFAULT_PRESET_ID for an unrecognized id', () => {
    expect(normalizeStoredPresetId('unknown-theme')).toBe(DEFAULT_PRESET_ID);
  });

  it('returns DEFAULT_PRESET_ID for "dark-mode" (non-existent)', () => {
    expect(normalizeStoredPresetId('dark-mode')).toBe(DEFAULT_PRESET_ID);
  });

  it('returns DEFAULT_PRESET_ID for a random string', () => {
    expect(normalizeStoredPresetId('xyzzy')).toBe(DEFAULT_PRESET_ID);
  });
});
