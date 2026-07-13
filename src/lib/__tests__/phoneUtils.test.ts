import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  validatePhone,
  validatePhoneDetailed,
  formatPhoneForDisplay,
  toWhatsAppJID,
  fromWhatsAppJID,
  phonesMatch,
  isSamePhone,
  normalizePhoneList,
  phoneVariants,
  isWhatsAppJID,
  VALID_DDDS,
} from '@/lib/phoneUtils';

// ── normalizePhone ────────────────────────────────────────────────────────────
describe('normalizePhone', () => {
  it('returns null for null', () => {
    expect(normalizePhone(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull();
  });

  it('normalizes a formatted BR number with DDI 55', () => {
    const result = normalizePhone('+55 (11) 98765-4321');
    expect(result).toBe('11987654321');
  });

  it('strips DDI 55 from a 13-digit number', () => {
    expect(normalizePhone('5511987654321')).toBe('11987654321');
  });

  it('returns 11-digit number as-is (valid DDD + mobile)', () => {
    expect(normalizePhone('11987654321')).toBe('11987654321');
  });

  it('adds 9th digit to 10-digit mobile number', () => {
    // DDD 11, number starts with 8 → mobile, needs 9
    expect(normalizePhone('1187654321')).toBe('11987654321');
  });

  it('returns null for number shorter than 10 digits', () => {
    expect(normalizePhone('1234567')).toBeNull();
  });

  it('returns non-null for 12-digit number without DDI (treated as international)', () => {
    // Numbers >11 digits not starting with 55 are returned as-is (international fallback)
    expect(normalizePhone('112233445566')).not.toBeNull();
  });

  it('returns null for invalid DDD', () => {
    // DDD 20 is not valid
    expect(normalizePhone('20987654321')).toBeNull();
  });

  it('handles number as a numeric type', () => {
    // Will be stringified then processed
    const result = normalizePhone(11987654321);
    expect(result).toBe('11987654321');
  });

  it('handles SP mobile number DDD 11', () => {
    expect(normalizePhone('11999999999')).toBe('11999999999');
  });

  it('handles RJ number DDD 21', () => {
    expect(normalizePhone('21987654321')).toBe('21987654321');
  });
});

// ── validatePhone ─────────────────────────────────────────────────────────────
describe('validatePhone', () => {
  it('returns valid: false for empty string', () => {
    expect(validatePhone('').valid).toBe(false);
  });

  it('returns valid: true for a valid BR mobile', () => {
    expect(validatePhone('11987654321').valid).toBe(true);
  });

  it('includes error message for invalid number', () => {
    const result = validatePhone('123');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns normalized for a valid number', () => {
    const result = validatePhone('+55 (11) 98765-4321');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('11987654321');
  });

  it('includes type "mobile" for 11-digit number', () => {
    const result = validatePhone('11987654321');
    expect(result.type).toBe('mobile');
  });

  it('classifies international number as valid', () => {
    const result = validatePhone('+1 415 555 0132');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('international');
  });
});

// ── validatePhoneDetailed ─────────────────────────────────────────────────────
describe('validatePhoneDetailed', () => {
  it('returns valid: false for null', () => {
    expect(validatePhoneDetailed(null).valid).toBe(false);
  });

  it('returns valid: true with type "mobile" for an 11-digit number', () => {
    const result = validatePhoneDetailed('11987654321');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('mobile');
    expect(result.normalized).toBe('11987654321');
  });

  it('returns valid: false with error for invalid DDD', () => {
    const result = validatePhoneDetailed('20987654321');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns formatted phone', () => {
    const result = validatePhoneDetailed('11987654321');
    expect(result.formatted).toContain('(11)');
  });
});

// ── formatPhoneForDisplay ─────────────────────────────────────────────────────
describe('formatPhoneForDisplay', () => {
  it('formats 11-digit mobile as (DDD) NNNNN-NNNN', () => {
    expect(formatPhoneForDisplay('11987654321')).toBe('(11) 98765-4321');
  });

  it('formats 10-digit landline as (DDD) NNNN-NNNN', () => {
    expect(formatPhoneForDisplay('1133334444')).toBe('(11) 3333-4444');
  });

  it('returns empty string for empty input', () => {
    expect(formatPhoneForDisplay('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatPhoneForDisplay(null)).toBe('');
  });

  it('formats number with DDI prefix', () => {
    expect(formatPhoneForDisplay('5511987654321')).toBe('(11) 98765-4321');
  });

  it('formats formatted BR number by re-normalizing', () => {
    expect(formatPhoneForDisplay('+55 (11) 98765-4321')).toBe('(11) 98765-4321');
  });
});

// ── toWhatsAppJID ─────────────────────────────────────────────────────────────
describe('toWhatsAppJID', () => {
  it('converts a normalized phone to a @c.us JID', () => {
    expect(toWhatsAppJID('11987654321')).toBe('5511987654321@c.us');
  });

  it('returns null for invalid phone', () => {
    expect(toWhatsAppJID('123')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(toWhatsAppJID(null)).toBeNull();
  });

  it('prefixes with country code 55', () => {
    const jid = toWhatsAppJID('21987654321');
    expect(jid).toMatch(/^5521/);
  });
});

// ── fromWhatsAppJID ───────────────────────────────────────────────────────────
describe('fromWhatsAppJID', () => {
  it('extracts phone from @c.us JID', () => {
    expect(fromWhatsAppJID('5511987654321@c.us')).toBe('11987654321');
  });

  it('returns null for null input', () => {
    expect(fromWhatsAppJID(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(fromWhatsAppJID('')).toBeNull();
  });

  it('handles @s.whatsapp.net JID', () => {
    expect(fromWhatsAppJID('5511987654321@s.whatsapp.net')).toBe('11987654321');
  });
});

// ── phonesMatch / isSamePhone ─────────────────────────────────────────────────
describe('phonesMatch', () => {
  it('returns true for identical phones', () => {
    expect(phonesMatch('11987654321', '11987654321')).toBe(true);
  });

  it('returns true for 9th-digit variant match (11 vs 10 digits)', () => {
    // '11987654321' vs '1187654321' (without 9) — same mobile
    expect(phonesMatch('11987654321', '1187654321')).toBe(true);
  });

  it('returns false for completely different phones', () => {
    expect(phonesMatch('11987654321', '21987654321')).toBe(false);
  });

  it('returns false when either is null', () => {
    expect(phonesMatch(null, '11987654321')).toBe(false);
    expect(phonesMatch('11987654321', null)).toBe(false);
  });

  it('isSamePhone is an alias for phonesMatch', () => {
    expect(isSamePhone).toBe(phonesMatch);
  });
});

// ── normalizePhoneList ────────────────────────────────────────────────────────
describe('normalizePhoneList', () => {
  it('returns empty array for empty input', () => {
    expect(normalizePhoneList([])).toEqual([]);
  });

  it('filters out invalid phones', () => {
    const result = normalizePhoneList(['11987654321', 'invalid', '123']);
    expect(result).toEqual(['11987654321']);
  });

  it('deduplicates phones', () => {
    const result = normalizePhoneList(['11987654321', '+55 (11) 98765-4321']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('11987654321');
  });

  it('normalizes each phone', () => {
    const result = normalizePhoneList(['+55 (11) 98765-4321', '21987654321']);
    expect(result).toContain('11987654321');
    expect(result).toContain('21987654321');
  });
});

// ── phoneVariants ─────────────────────────────────────────────────────────────
describe('phoneVariants', () => {
  it('returns empty array for invalid phone', () => {
    expect(phoneVariants('abc')).toEqual([]);
  });

  it('returns the 11-digit form and 10-digit variant for mobile', () => {
    const variants = phoneVariants('11987654321');
    expect(variants).toContain('11987654321');
    // Should include the 10-digit version without 9th digit
    expect(variants).toContain('1187654321');
  });

  it('returns both forms for 10-digit input', () => {
    const variants = phoneVariants('1187654321');
    expect(variants.length).toBeGreaterThanOrEqual(1);
  });

  it('returns no duplicates', () => {
    const variants = phoneVariants('11987654321');
    expect(variants.length).toBe(new Set(variants).size);
  });
});

// ── isWhatsAppJID ─────────────────────────────────────────────────────────────
describe('isWhatsAppJID', () => {
  it('returns true for @c.us JID', () => {
    expect(isWhatsAppJID('5511987654321@c.us')).toBe(true);
  });

  it('returns true for @s.whatsapp.net JID', () => {
    expect(isWhatsAppJID('5511987654321@s.whatsapp.net')).toBe(true);
  });

  it('returns true for @g.us group JID', () => {
    expect(isWhatsAppJID('120363021111111111@g.us')).toBe(true);
  });

  it('returns false for bare phone number', () => {
    expect(isWhatsAppJID('5511987654321')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isWhatsAppJID(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isWhatsAppJID('')).toBe(false);
  });

  it('returns false for non-JID string', () => {
    expect(isWhatsAppJID('not-a-jid')).toBe(false);
  });
});

// ── VALID_DDDS constant ───────────────────────────────────────────────────────
describe('VALID_DDDS', () => {
  it('contains SP DDD 11', () => {
    expect(VALID_DDDS.has(11)).toBe(true);
  });

  it('contains RJ DDD 21', () => {
    expect(VALID_DDDS.has(21)).toBe(true);
  });

  it('does not contain invalid DDD 20', () => {
    expect(VALID_DDDS.has(20)).toBe(false);
  });

  it('has at least 60 valid DDDs', () => {
    expect(VALID_DDDS.size).toBeGreaterThanOrEqual(60);
  });
});
