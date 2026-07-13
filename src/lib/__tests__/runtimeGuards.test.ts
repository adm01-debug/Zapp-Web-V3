import { describe, it, expect } from 'vitest';
import {
  isRecord,
  hasField,
  hasSuccessFlag,
  isSuccessful,
  readNumber,
  readString,
  hasArrayField,
  readArray,
  readVariants,
} from '@/lib/runtimeGuards';

// ── isRecord ──────────────────────────────────────────────────────────────────

describe('isRecord', () => {
  it('returns true for a plain object', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns true for an empty object', () => {
    expect(isRecord({})).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRecord('hello')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRecord(42)).toBe(false);
  });

  it('returns false for a boolean', () => {
    expect(isRecord(true)).toBe(false);
  });

  it('returns false for a function', () => {
    expect(isRecord(() => {})).toBe(false);
  });
});

// ── hasField ──────────────────────────────────────────────────────────────────

describe('hasField', () => {
  it('returns true when the key exists on the object', () => {
    expect(hasField({ name: 'Alice' }, 'name')).toBe(true);
  });

  it('returns true for a key with undefined value', () => {
    expect(hasField({ key: undefined }, 'key')).toBe(true);
  });

  it('returns false when the key is absent', () => {
    expect(hasField({ a: 1 }, 'b')).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasField(null, 'a')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasField(undefined, 'a')).toBe(false);
  });

  it('returns false for an array', () => {
    expect(hasField([], 'length')).toBe(false);
  });

  it('returns false for a string', () => {
    expect(hasField('hello', 'length')).toBe(false);
  });
});

// ── hasSuccessFlag ────────────────────────────────────────────────────────────

describe('hasSuccessFlag', () => {
  it('returns true when success is true', () => {
    expect(hasSuccessFlag({ success: true })).toBe(true);
  });

  it('returns true when success is false', () => {
    expect(hasSuccessFlag({ success: false })).toBe(true);
  });

  it('returns false when success field is absent', () => {
    expect(hasSuccessFlag({ status: 'ok' })).toBe(false);
  });

  it('returns false when success is a string', () => {
    expect(hasSuccessFlag({ success: 'yes' })).toBe(false);
  });

  it('returns false when success is a number', () => {
    expect(hasSuccessFlag({ success: 1 })).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasSuccessFlag(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasSuccessFlag(undefined)).toBe(false);
  });
});

// ── isSuccessful ──────────────────────────────────────────────────────────────

describe('isSuccessful', () => {
  it('returns true when success is true', () => {
    expect(isSuccessful({ success: true })).toBe(true);
  });

  it('returns false when success is false', () => {
    expect(isSuccessful({ success: false })).toBe(false);
  });

  it('returns false when success field is absent', () => {
    expect(isSuccessful({ data: {} })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSuccessful(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSuccessful(undefined)).toBe(false);
  });

  it('returns false when success is a string "true"', () => {
    expect(isSuccessful({ success: 'true' })).toBe(false);
  });

  it('returns true for a full success envelope', () => {
    expect(isSuccessful({ success: true, data: { id: 1 } })).toBe(true);
  });
});

// ── readNumber ────────────────────────────────────────────────────────────────

describe('readNumber', () => {
  it('returns the numeric field value', () => {
    expect(readNumber({ count: 42 }, 'count')).toBe(42);
  });

  it('returns 0 fallback when key is absent', () => {
    expect(readNumber({}, 'count')).toBe(0);
  });

  it('returns custom fallback when key is absent', () => {
    expect(readNumber({}, 'count', -1)).toBe(-1);
  });

  it('returns fallback when field is a string', () => {
    expect(readNumber({ count: 'five' }, 'count')).toBe(0);
  });

  it('returns fallback when field is null', () => {
    expect(readNumber({ count: null }, 'count')).toBe(0);
  });

  it('returns fallback for Infinity', () => {
    expect(readNumber({ count: Infinity }, 'count')).toBe(0);
  });

  it('returns fallback for NaN', () => {
    expect(readNumber({ count: NaN }, 'count')).toBe(0);
  });

  it('returns 0 for null input', () => {
    expect(readNumber(null, 'count')).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(readNumber({ delta: -5 }, 'delta')).toBe(-5);
  });

  it('handles 0 as a valid value (not treated as falsy)', () => {
    expect(readNumber({ n: 0 }, 'n', 99)).toBe(0);
  });
});

// ── readString ────────────────────────────────────────────────────────────────

describe('readString', () => {
  it('returns the string field value', () => {
    expect(readString({ name: 'Alice' }, 'name')).toBe('Alice');
  });

  it('returns "" fallback when key is absent', () => {
    expect(readString({}, 'name')).toBe('');
  });

  it('returns custom fallback when key is absent', () => {
    expect(readString({}, 'name', 'unknown')).toBe('unknown');
  });

  it('returns fallback when field is a number', () => {
    expect(readString({ name: 42 }, 'name')).toBe('');
  });

  it('returns fallback when field is null', () => {
    expect(readString({ name: null }, 'name')).toBe('');
  });

  it('returns fallback when field is boolean', () => {
    expect(readString({ name: true }, 'name')).toBe('');
  });

  it('returns empty string when field IS an empty string', () => {
    expect(readString({ name: '' }, 'name', 'default')).toBe('');
  });

  it('returns fallback for null input', () => {
    expect(readString(null, 'name')).toBe('');
  });
});

// ── hasArrayField ─────────────────────────────────────────────────────────────

describe('hasArrayField', () => {
  it('returns true for a field holding an array', () => {
    expect(hasArrayField({ items: [1, 2, 3] }, 'items')).toBe(true);
  });

  it('returns true for a field holding an empty array', () => {
    expect(hasArrayField({ items: [] }, 'items')).toBe(true);
  });

  it('returns false when field is absent', () => {
    expect(hasArrayField({}, 'items')).toBe(false);
  });

  it('returns false when field is an object (not array)', () => {
    expect(hasArrayField({ items: {} }, 'items')).toBe(false);
  });

  it('returns false when field is a string', () => {
    expect(hasArrayField({ items: 'list' }, 'items')).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasArrayField(null, 'items')).toBe(false);
  });
});

// ── readArray ─────────────────────────────────────────────────────────────────

describe('readArray', () => {
  it('returns the array when present', () => {
    expect(readArray({ items: [1, 2] }, 'items')).toEqual([1, 2]);
  });

  it('returns an empty array when key is absent', () => {
    expect(readArray({}, 'items')).toEqual([]);
  });

  it('returns an empty array when field is not an array', () => {
    expect(readArray({ items: 'not-an-array' }, 'items')).toEqual([]);
  });

  it('returns an empty array for null input', () => {
    expect(readArray(null, 'items')).toEqual([]);
  });

  it('returns typed elements when cast with generic', () => {
    const result = readArray<string>({ names: ['Alice', 'Bob'] }, 'names');
    expect(result).toEqual(['Alice', 'Bob']);
  });
});

// ── readVariants ──────────────────────────────────────────────────────────────

describe('readVariants', () => {
  it('returns the variants array when present', () => {
    expect(readVariants({ variants: ['S', 'M', 'L'] })).toEqual(['S', 'M', 'L']);
  });

  it('returns an empty array when variants is absent', () => {
    expect(readVariants({ name: 'Product' })).toEqual([]);
  });

  it('returns an empty array for null', () => {
    expect(readVariants(null)).toEqual([]);
  });

  it('returns an empty array when variants is not an array', () => {
    expect(readVariants({ variants: 'S,M,L' })).toEqual([]);
  });
});
