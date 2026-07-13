/**
 * Tests for useMountedRef().
 *
 * Verifies that the ref tracks mount/unmount lifecycle correctly.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMountedRef } from '../useMountedRef';

describe('useMountedRef', () => {
  it('returns a ref that is true while the component is mounted', () => {
    const { result } = renderHook(() => useMountedRef());
    expect(result.current.current).toBe(true);
  });

  it('ref becomes false after the component unmounts', () => {
    const { result, unmount } = renderHook(() => useMountedRef());
    expect(result.current.current).toBe(true);
    unmount();
    expect(result.current.current).toBe(false);
  });

  it('returns the same ref object across renders', () => {
    const { result, rerender } = renderHook(() => useMountedRef());
    const firstRef = result.current;
    rerender();
    expect(result.current).toBe(firstRef);
  });
});
