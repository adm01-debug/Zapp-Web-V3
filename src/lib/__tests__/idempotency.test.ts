import { describe, it, expect } from 'vitest';
import {
  stableStringify,
  normalizeIdempotencyKey,
  sha256Hex,
} from '@/lib/idempotency';

// ── stableStringify ───────────────────────────────────────────────────────────

describe('stableStringify', () => {
  it('serializes null to "null"', () => {
    expect(stableStringify(null)).toBe('null');
  });

  it('serializes a string', () => {
    expect(stableStringify('hello')).toBe('"hello"');
  });

  it('serializes an integer', () => {
    expect(stableStringify(42)).toBe('42');
  });

  it('serializes 0', () => {
    expect(stableStringify(0)).toBe('0');
  });

  it('serializes a float', () => {
    expect(stableStringify(3.14)).toBe('3.14');
  });

  it('serializes true', () => {
    expect(stableStringify(true)).toBe('true');
  });

  it('serializes false', () => {
    expect(stableStringify(false)).toBe('false');
  });

  it('serializes undefined as JSON undefined (no output)', () => {
    expect(stableStringify(undefined)).toBeUndefined();
  });

  it('replaces Infinity with null', () => {
    expect(stableStringify(Infinity)).toBe('null');
  });

  it('replaces NaN with null', () => {
    expect(stableStringify(NaN)).toBe('null');
  });

  it('replaces -Infinity with null', () => {
    expect(stableStringify(-Infinity)).toBe('null');
  });

  it('serializes empty object', () => {
    expect(stableStringify({})).toBe('{}');
  });

  it('serializes empty array', () => {
    expect(stableStringify([])).toBe('[]');
  });

  it('serializes a simple array preserving order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('sorts object keys alphabetically', () => {
    const result = stableStringify({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('produces the same output regardless of insertion order', () => {
    const a = stableStringify({ b: 2, a: 1 });
    const b = stableStringify({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('excludes undefined values from objects', () => {
    const result = stableStringify({ a: 1, b: undefined, c: 3 });
    expect(result).toBe('{"a":1,"c":3}');
  });

  it('excludes function values from objects', () => {
    const result = stableStringify({ a: 1, fn: () => 42 });
    expect(result).toBe('{"a":1}');
  });

  it('replaces undefined in arrays with null', () => {
    const result = stableStringify([1, undefined, 3]);
    expect(result).toBe('[1,null,3]');
  });

  it('sorts keys in nested objects', () => {
    const result = stableStringify({ b: { z: 1, a: 2 }, a: 0 });
    expect(result).toBe('{"a":0,"b":{"a":2,"z":1}}');
  });

  it('handles circular references by replacing with null', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = stableStringify(obj);
    expect(result).toBe('{"a":1,"self":null}');
  });

  it('produces deterministic output for the same input', () => {
    const val = { z: [3, 1], a: { x: 'hello' } };
    expect(stableStringify(val)).toBe(stableStringify(val));
  });
});

// ── normalizeIdempotencyKey ───────────────────────────────────────────────────

describe('normalizeIdempotencyKey', () => {
  it('returns undefined for undefined input', () => {
    expect(normalizeIdempotencyKey(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeIdempotencyKey('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(normalizeIdempotencyKey('   ')).toBeUndefined();
  });

  it('trims leading and trailing whitespace', () => {
    const result = normalizeIdempotencyKey('  hello  ');
    expect(result).toBe('hello');
  });

  it('passes through a valid ASCII key unchanged', () => {
    expect(normalizeIdempotencyKey('abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('passes through safe special chars unchanged', () => {
    expect(normalizeIdempotencyKey('key:v1.0+abc/def=base')).toBe('key:v1.0+abc/def=base');
  });

  it('replaces space with underscore', () => {
    const result = normalizeIdempotencyKey('hello world');
    expect(result).toBe('hello_world');
  });

  it('replaces @ with underscore', () => {
    const result = normalizeIdempotencyKey('user@example.com');
    expect(result).toBe('user_example.com');
  });

  it('replaces non-ASCII characters with underscores', () => {
    const result = normalizeIdempotencyKey('café');
    expect(result).toBe('caf_');
  });

  it('replaces ampersand with underscore', () => {
    const result = normalizeIdempotencyKey('a&b');
    expect(result).toBe('a_b');
  });

  it('returns the key unchanged when <= 128 chars', () => {
    const key = 'a'.repeat(128);
    const result = normalizeIdempotencyKey(key);
    expect(result).toBe(key);
  });

  it('truncates and appends suffix when key > 128 chars', () => {
    const key = 'a'.repeat(200);
    const result = normalizeIdempotencyKey(key);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(128);
  });

  it('suffix of truncated key starts with ":h"', () => {
    const key = 'b'.repeat(200);
    const result = normalizeIdempotencyKey(key)!;
    expect(result).toContain(':h');
  });

  it('two different long keys produce different normalized values', () => {
    const key1 = 'a'.repeat(200);
    const key2 = 'b'.repeat(200);
    expect(normalizeIdempotencyKey(key1)).not.toBe(normalizeIdempotencyKey(key2));
  });

  it('is deterministic — same input → same output', () => {
    const key = 'req-id-12345-xyz';
    expect(normalizeIdempotencyKey(key)).toBe(normalizeIdempotencyKey(key));
  });
});

// ── sha256Hex ─────────────────────────────────────────────────────────────────

describe('sha256Hex', () => {
  it('returns a 64-character hex string', async () => {
    const result = await sha256Hex('hello world');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for the same input (deterministic)', async () => {
    const a = await sha256Hex('test');
    const b = await sha256Hex('test');
    expect(a).toBe(b);
  });

  it('returns different hashes for different inputs', async () => {
    const a = await sha256Hex('input-a');
    const b = await sha256Hex('input-b');
    expect(a).not.toBe(b);
  });

  it('handles empty string', async () => {
    const result = await sha256Hex('');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('handles unicode input', async () => {
    const result = await sha256Hex('João 🎉');
    expect(result).toHaveLength(64);
  });
});
