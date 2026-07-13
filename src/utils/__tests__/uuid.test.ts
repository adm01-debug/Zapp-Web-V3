import { describe, it, expect } from 'vitest';
import { isValidUUID } from '../uuid';

// ── null / falsy inputs ───────────────────────────────────────────────────────

describe('isValidUUID — null / falsy', () => {
  it('returns false for null', () => {
    expect(isValidUUID(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidUUID(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });
});

// ── valid UUIDs ───────────────────────────────────────────────────────────────

describe('isValidUUID — valid RFC 4122 UUIDs', () => {
  it('returns true for a v4 UUID (lowercase)', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('returns true for a v4 UUID (uppercase)', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('returns true for a v4 UUID (mixed case)', () => {
    expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
  });

  it('returns true for a v1 UUID', () => {
    expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
  });

  it('returns true for all-zeros UUID', () => {
    expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('returns true for all-f UUID', () => {
    expect(isValidUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
  });

  it('returns true for UUID with hex digits a-f', () => {
    expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });
});

// ── WhatsApp JIDs ─────────────────────────────────────────────────────────────

describe('isValidUUID — WhatsApp JIDs (must reject)', () => {
  it('returns false for a JID with @s.whatsapp.net suffix', () => {
    expect(isValidUUID('551146375517@s.whatsapp.net')).toBe(false);
  });

  it('returns false for a JID with @g.us suffix (group)', () => {
    expect(isValidUUID('5511999999999-1234567890@g.us')).toBe(false);
  });

  it('returns false for a plain phone number string', () => {
    expect(isValidUUID('5511463755170')).toBe(false);
  });

  it('returns false for a phone number without country code', () => {
    expect(isValidUUID('11987654321')).toBe(false);
  });
});

// ── malformed UUIDs ───────────────────────────────────────────────────────────

describe('isValidUUID — malformed UUIDs', () => {
  it('returns false when hyphens are missing', () => {
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('returns false for UUID with extra hyphen', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-4466-55440000')).toBe(false);
  });

  it('returns false for UUID that is too short', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000')).toBe(false);
  });

  it('returns false for UUID that is too long', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-4466554400000')).toBe(false);
  });

  it('returns false for UUID with invalid character (g)', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
  });

  it('returns false for UUID with spaces', () => {
    expect(isValidUUID('550e8400 e29b 41d4 a716 446655440000')).toBe(false);
  });
});

// ── SQL injection strings ─────────────────────────────────────────────────────

describe('isValidUUID — SQL injection / adversarial inputs', () => {
  it('returns false for a SQL injection string', () => {
    expect(isValidUUID("'; DROP TABLE contacts; --")).toBe(false);
  });

  it('returns false for a number-like string', () => {
    expect(isValidUUID('12345')).toBe(false);
  });

  it('returns false for a plain word', () => {
    expect(isValidUUID('invalid')).toBe(false);
  });

  it('returns false for a URL string', () => {
    expect(isValidUUID('https://example.com')).toBe(false);
  });
});
