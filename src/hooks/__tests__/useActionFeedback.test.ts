import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn().mockReturnValue('toast-1'), {
    success: vi.fn().mockReturnValue('toast-1'),
    error: vi.fn().mockReturnValue('toast-1'),
    warning: vi.fn().mockReturnValue('toast-1'),
    info: vi.fn().mockReturnValue('toast-1'),
    loading: vi.fn().mockReturnValue('toast-1'),
    dismiss: vi.fn(),
  })
);

vi.mock('sonner', () => ({
  toast: mockToast,
}));

import { useActionFeedback } from '@/hooks/useActionFeedback';

describe('useActionFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockReturnValue('toast-1');
    mockToast.success.mockReturnValue('toast-1');
    mockToast.error.mockReturnValue('toast-1');
    mockToast.warning.mockReturnValue('toast-1');
    mockToast.info.mockReturnValue('toast-1');
    mockToast.loading.mockReturnValue('toast-1');
  });

  it('initializes without error', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(result.current).toBeDefined();
  });

  it('exposes success function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.success).toBe('function');
  });

  it('exposes error function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.error).toBe('function');
  });

  it('exposes warning function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.warning).toBe('function');
  });

  it('exposes info function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.info).toBe('function');
  });

  it('exposes showFeedback function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.showFeedback).toBe('function');
  });

  it('success calls toast', () => {
    const { result } = renderHook(() => useActionFeedback());

    act(() => {
      result.current.success('Operação concluída');
    });

    expect(mockToast.success).toHaveBeenCalled();
  });

  it('error calls toast.error', () => {
    const { result } = renderHook(() => useActionFeedback());

    act(() => {
      result.current.error('Falha na operação');
    });

    expect(mockToast.error).toHaveBeenCalled();
  });

  it('showFeedback accepts custom options', () => {
    const { result } = renderHook(() => useActionFeedback());

    act(() => {
      result.current.showFeedback('info', {
        description: 'Custom message',
        title: 'Custom Title',
        duration: 5000,
      });
    });

    expect(mockToast.info).toHaveBeenCalledWith(
      'Custom Title',
      expect.objectContaining({ description: expect.stringContaining('Custom message') })
    );
  });

  it('showFeedback with action includes action text', () => {
    const { result } = renderHook(() => useActionFeedback());
    const onClick = vi.fn();

    act(() => {
      result.current.showFeedback('success', {
        description: 'Action available',
        action: { label: 'Desfazer', onClick },
      });
    });

    expect(mockToast.success).toHaveBeenCalled();
    const callArg = mockToast.success.mock.calls[0][1];
    expect(callArg.description).toContain('Desfazer');
  });

  it('all feedback types are callable', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.info).toBe('function');
  });

  it('exposes withFeedback for async operations', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.withFeedback).toBe('function');
  });
});
