import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger');

import { usePushNotifications } from '@/hooks/usePushNotifications';

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes requestPermission function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.requestPermission).toBe('function');
  });

  it('exposes subscribe function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.subscribe).toBe('function');
  });

  it('exposes unsubscribe function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.unsubscribe).toBe('function');
  });

  it('exposes showNotification function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.showNotification).toBe('function');
  });

  it('exposes toggleSubscription function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.toggleSubscription).toBe('function');
  });

  it('initializes isSubscribed as false', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSubscribed).toBe(false);
  });

  it('has permission property', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.permission).toBeDefined();
  });

  it('has isSupported property', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.isSupported).toBe('boolean');
  });
});
