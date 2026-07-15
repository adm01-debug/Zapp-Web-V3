// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

describe('getAvatarColor', () => {
  it('returns an object with bg and text properties', () => {
    const result = getAvatarColor('Alice');
    expect(result).toHaveProperty('bg');
    expect(result).toHaveProperty('text');
    expect(typeof result.bg).toBe('string');
    expect(typeof result.text).toBe('string');
  });

  it('is deterministic — same name always yields same palette', () => {
    const a = getAvatarColor('João');
    const b = getAvatarColor('João');
    expect(a).toEqual(b);
  });

  it('produces different palettes for different names', () => {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eduardo'];
    const palettes = names.map(getAvatarColor);
    // At least two should differ (hash distribution)
    const unique = new Set(palettes.map((p) => p.bg));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('handles empty string without throwing', () => {
    expect(() => getAvatarColor('')).not.toThrow();
  });

  it('handles single-character names', () => {
    const result = getAvatarColor('Z');
    expect(result.bg).toBeTruthy();
    expect(result.text).toBeTruthy();
  });

  it('handles long names without throwing', () => {
    const long = 'Antônio Carlos Magalhães Neto Filho da Silva';
    expect(() => getAvatarColor(long)).not.toThrow();
  });

  it('bg value is a non-empty string', () => {
    expect(getAvatarColor('Test').bg.length).toBeGreaterThan(0);
  });

  it('text value is a non-empty string', () => {
    expect(getAvatarColor('Test').text.length).toBeGreaterThan(0);
  });
});

describe('getInitials', () => {
  it('returns first letter of a single-word name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('returns first two initials from a full name', () => {
    expect(getInitials('João Silva')).toBe('JS');
  });

  it('returns only up to two characters for names with many words', () => {
    const result = getInitials('Antônio Carlos Magalhães Neto');
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result).toBe('AC');
  });

  it('returns uppercase initials', () => {
    const result = getInitials('alice bob');
    expect(result).toBe(result.toUpperCase());
  });

  it('handles empty string gracefully', () => {
    expect(getInitials('')).toBe('');
  });

  it('handles single character name', () => {
    expect(getInitials('X')).toBe('X');
  });

  it('skips empty segments from extra whitespace tokens', () => {
    // Split on space — multiple spaces yield empty strings which filter(Boolean) removes
    const result = getInitials('  Ana  Beatriz  ');
    // Leading/trailing spaces cause empty first/last tokens; only 'Ana' and 'Beatriz' survive
    expect(result).toContain('A');
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('returns two characters for two-word name', () => {
    expect(getInitials('Maria Jose')).toBe('MJ');
  });

  it('is deterministic', () => {
    expect(getInitials('Carlos Eduardo')).toBe(getInitials('Carlos Eduardo'));
  });
});