// @ts-nocheck
/**
 * Tests for react-refs.ts — asRef() is a pure runtime identity cast; the
 * type aliases (AnyRef, NullableRefObject) have no runtime representation.
 *
 * The only invariant worth guarding: asRef() must return the SAME object
 * reference it receives, preserving every field on the object.
 */
import { describe, it, expect } from 'vitest';

// No React runtime import needed — react-refs.ts only imports React types.
import { asRef } from '../react-refs';

describe('asRef', () => {
  it('returns the exact same object reference as input', () => {
    const ref = { current: null };
    expect(asRef(ref)).toBe(ref);
  });

  it('preserves current: null', () => {
    const ref = { current: null };
    expect(asRef(ref).current).toBeNull();
  });

  it('preserves a DOM element in current', () => {
    const el = document.createElement('div');
    const ref = { current: el };
    expect(asRef(ref).current).toBe(el);
  });

  it('preserves any non-null value in current', () => {
    const ref = { current: { nested: true } };
    expect(asRef(ref).current).toEqual({ nested: true });
  });

  it('two distinct refs map to themselves independently', () => {
    const refA = { current: 'a' };
    const refB = { current: 'b' };
    expect(asRef(refA)).toBe(refA);
    expect(asRef(refB)).toBe(refB);
    expect(asRef(refA)).not.toBe(refB);
  });
});