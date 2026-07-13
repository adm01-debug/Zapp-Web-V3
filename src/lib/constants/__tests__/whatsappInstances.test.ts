import { describe, it, expect } from 'vitest';
import {
  WHATSAPP_INSTANCES,
  DEFAULT_WHATSAPP_INSTANCE,
  ACTIVE_WHATSAPP_INSTANCE,
  ALL_INSTANCES_FILTER,
  SELECTABLE_WHATSAPP_INSTANCES,
  isValidWhatsAppInstance,
  coerceWhatsAppInstance,
  type WhatsAppInstance,
} from '../whatsappInstances';

// ── WHATSAPP_INSTANCES ────────────────────────────────────────────────────────

describe('WHATSAPP_INSTANCES', () => {
  it('has exactly 3 entries', () => {
    expect(WHATSAPP_INSTANCES).toHaveLength(3);
  });

  it('contains "wpp2"', () => {
    expect(WHATSAPP_INSTANCES).toContain('wpp2');
  });

  it('contains "wpp_pink_test"', () => {
    expect(WHATSAPP_INSTANCES).toContain('wpp_pink_test');
  });

  it('contains "default"', () => {
    expect(WHATSAPP_INSTANCES).toContain('default');
  });

  it('all elements are strings', () => {
    WHATSAPP_INSTANCES.forEach((i) => expect(typeof i).toBe('string'));
  });
});

// ── DEFAULT_WHATSAPP_INSTANCE ────────────────────────────────────────────────

describe('DEFAULT_WHATSAPP_INSTANCE', () => {
  it('is "wpp2"', () => {
    expect(DEFAULT_WHATSAPP_INSTANCE).toBe('wpp2');
  });

  it('is a member of WHATSAPP_INSTANCES', () => {
    expect(WHATSAPP_INSTANCES).toContain(DEFAULT_WHATSAPP_INSTANCE);
  });
});

// ── ACTIVE_WHATSAPP_INSTANCE ─────────────────────────────────────────────────

describe('ACTIVE_WHATSAPP_INSTANCE', () => {
  it('is "wpp_pink_test"', () => {
    expect(ACTIVE_WHATSAPP_INSTANCE).toBe('wpp_pink_test');
  });

  it('is a member of WHATSAPP_INSTANCES', () => {
    expect(WHATSAPP_INSTANCES).toContain(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('is not the same as DEFAULT_WHATSAPP_INSTANCE', () => {
    expect(ACTIVE_WHATSAPP_INSTANCE).not.toBe(DEFAULT_WHATSAPP_INSTANCE);
  });
});

// ── ALL_INSTANCES_FILTER ──────────────────────────────────────────────────────

describe('ALL_INSTANCES_FILTER', () => {
  it('is null', () => {
    expect(ALL_INSTANCES_FILTER).toBeNull();
  });
});

// ── SELECTABLE_WHATSAPP_INSTANCES ─────────────────────────────────────────────

describe('SELECTABLE_WHATSAPP_INSTANCES', () => {
  it('has exactly 2 entries (excludes "default")', () => {
    expect(SELECTABLE_WHATSAPP_INSTANCES).toHaveLength(2);
  });

  it('does not contain "default"', () => {
    expect(SELECTABLE_WHATSAPP_INSTANCES).not.toContain('default');
  });

  it('contains "wpp2"', () => {
    expect(SELECTABLE_WHATSAPP_INSTANCES).toContain('wpp2');
  });

  it('contains "wpp_pink_test"', () => {
    expect(SELECTABLE_WHATSAPP_INSTANCES).toContain('wpp_pink_test');
  });

  it('every element is also in WHATSAPP_INSTANCES', () => {
    SELECTABLE_WHATSAPP_INSTANCES.forEach((i) => {
      expect(WHATSAPP_INSTANCES).toContain(i);
    });
  });
});

// ── isValidWhatsAppInstance — valid values ────────────────────────────────────

describe('isValidWhatsAppInstance — valid instances', () => {
  it('returns true for "wpp2"', () => {
    expect(isValidWhatsAppInstance('wpp2')).toBe(true);
  });

  it('returns true for "wpp_pink_test"', () => {
    expect(isValidWhatsAppInstance('wpp_pink_test')).toBe(true);
  });

  it('returns true for "default"', () => {
    expect(isValidWhatsAppInstance('default')).toBe(true);
  });
});

// ── isValidWhatsAppInstance — invalid values ──────────────────────────────────

describe('isValidWhatsAppInstance — invalid values', () => {
  it('returns false for null', () => {
    expect(isValidWhatsAppInstance(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidWhatsAppInstance(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isValidWhatsAppInstance(42)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidWhatsAppInstance('')).toBe(false);
  });

  it('returns false for an unknown instance name', () => {
    expect(isValidWhatsAppInstance('wpp3')).toBe(false);
  });

  it('returns false for a partial match "wpp"', () => {
    expect(isValidWhatsAppInstance('wpp')).toBe(false);
  });

  it('returns false for "WPP2" (case-sensitive)', () => {
    expect(isValidWhatsAppInstance('WPP2')).toBe(false);
  });

  it('returns false for a plain object', () => {
    expect(isValidWhatsAppInstance({ name: 'wpp2' })).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isValidWhatsAppInstance(['wpp2'])).toBe(false);
  });

  it('returns false for boolean true', () => {
    expect(isValidWhatsAppInstance(true)).toBe(false);
  });
});

// ── coerceWhatsAppInstance — valid values pass through ────────────────────────

describe('coerceWhatsAppInstance — valid values', () => {
  it('returns "wpp2" when given "wpp2"', () => {
    expect(coerceWhatsAppInstance('wpp2')).toBe('wpp2');
  });

  it('returns "wpp_pink_test" when given "wpp_pink_test"', () => {
    expect(coerceWhatsAppInstance('wpp_pink_test')).toBe('wpp_pink_test');
  });

  it('returns "default" when given "default"', () => {
    expect(coerceWhatsAppInstance('default')).toBe('default');
  });
});

// ── coerceWhatsAppInstance — invalid values fall back to ACTIVE ───────────────

describe('coerceWhatsAppInstance — invalid values fall back', () => {
  it('returns ACTIVE_WHATSAPP_INSTANCE for null', () => {
    expect(coerceWhatsAppInstance(null)).toBe(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('returns ACTIVE_WHATSAPP_INSTANCE for undefined', () => {
    expect(coerceWhatsAppInstance(undefined)).toBe(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('returns ACTIVE_WHATSAPP_INSTANCE for an empty string', () => {
    expect(coerceWhatsAppInstance('')).toBe(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('returns ACTIVE_WHATSAPP_INSTANCE for an unknown name', () => {
    expect(coerceWhatsAppInstance('wpp_unknown')).toBe(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('returns ACTIVE_WHATSAPP_INSTANCE for a number', () => {
    expect(coerceWhatsAppInstance(1)).toBe(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('returns ACTIVE_WHATSAPP_INSTANCE for a plain object', () => {
    expect(coerceWhatsAppInstance({})).toBe(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('returns ACTIVE_WHATSAPP_INSTANCE for "WPP2" (case-sensitive)', () => {
    expect(coerceWhatsAppInstance('WPP2')).toBe(ACTIVE_WHATSAPP_INSTANCE);
  });

  it('fallback value is a valid WhatsAppInstance', () => {
    const fallback = coerceWhatsAppInstance(null);
    expect(isValidWhatsAppInstance(fallback)).toBe(true);
  });
});
