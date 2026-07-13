/**
 * Tests for useAmbientColor().
 *
 * The hook is a pure useMemo mapping — no external dependencies.
 * Each sentiment value maps to a specific set of CSS tokens.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAmbientColor } from '../useAmbientColor';

describe('useAmbientColor — positive sentiment', () => {
  it('returns success bgTint for "positive"', () => {
    const { result } = renderHook(() => useAmbientColor('positive'));
    expect(result.current.bgTint).toContain('success');
  });

  it('returns success borderAccent for "positive"', () => {
    const { result } = renderHook(() => useAmbientColor('positive'));
    expect(result.current.borderAccent).toContain('success');
  });

  it('returns "ambient-positive" className for "positive"', () => {
    const { result } = renderHook(() => useAmbientColor('positive'));
    expect(result.current.className).toBe('ambient-positive');
  });
});

describe('useAmbientColor — negative sentiment', () => {
  it('returns destructive bgTint for "negative"', () => {
    const { result } = renderHook(() => useAmbientColor('negative'));
    expect(result.current.bgTint).toContain('destructive');
  });

  it('returns destructive borderAccent for "negative"', () => {
    const { result } = renderHook(() => useAmbientColor('negative'));
    expect(result.current.borderAccent).toContain('destructive');
  });

  it('returns "ambient-negative" className for "negative"', () => {
    const { result } = renderHook(() => useAmbientColor('negative'));
    expect(result.current.className).toBe('ambient-negative');
  });
});

describe('useAmbientColor — neutral / fallback', () => {
  it('returns transparent bgTint for "neutral"', () => {
    const { result } = renderHook(() => useAmbientColor('neutral'));
    expect(result.current.bgTint).toBe('transparent');
  });

  it('returns "ambient-neutral" className for "neutral"', () => {
    const { result } = renderHook(() => useAmbientColor('neutral'));
    expect(result.current.className).toBe('ambient-neutral');
  });

  it('returns neutral colors for null', () => {
    const { result } = renderHook(() => useAmbientColor(null));
    expect(result.current.className).toBe('ambient-neutral');
  });

  it('returns neutral colors for undefined', () => {
    const { result } = renderHook(() => useAmbientColor(undefined));
    expect(result.current.className).toBe('ambient-neutral');
  });

  it('returns neutral colors for an unknown string', () => {
    const { result } = renderHook(() => useAmbientColor('unknown-value'));
    expect(result.current.className).toBe('ambient-neutral');
  });
});

describe('useAmbientColor — memoisation', () => {
  it('returns a new object when sentiment changes', () => {
    let sentiment = 'positive' as string | null;
    const { result, rerender } = renderHook(() => useAmbientColor(sentiment));
    const first = result.current;

    sentiment = 'negative';
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.className).toBe('ambient-negative');
  });

  it('returns the same object reference when sentiment does not change', () => {
    const { result, rerender } = renderHook(() => useAmbientColor('positive'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
