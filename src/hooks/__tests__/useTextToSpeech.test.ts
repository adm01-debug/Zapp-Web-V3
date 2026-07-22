import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/logger');

import { useTextToSpeech } from '@/hooks/useTextToSpeech';

describe('useTextToSpeech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with isPlaying false', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.isPlaying).toBe(false);
  });

  it('initializes with null error', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.error).toBeNull();
  });

  it('exposes speak function', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(typeof result.current.speak).toBe('function');
  });

  it('exposes stop function', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(typeof result.current.stop).toBe('function');
  });

  it('accepts optional default text argument', () => {
    const { result } = renderHook(() => useTextToSpeech('hello world'));
    expect(result.current.isPlaying).toBe(false);
  });
});
