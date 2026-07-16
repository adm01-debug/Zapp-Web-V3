import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/logger');

const mockUnregister = vi.hoisted(() => vi.fn());
const mockCaches = {
  keys: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockResolvedValue(true),
};

const mockRegistration = {
  scope: '/',
  update: vi.fn(),
  installing: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

describe('useServiceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnregister.mockResolvedValue(true);
    vi.useFakeTimers();
    sessionStorage.clear();

    Object.defineProperty(globalThis, 'caches', {
      value: mockCaches,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        controller: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: mockUnregister }]),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers service worker on mount', async () => {
    const { useServiceWorker } = await import('@/hooks/useServiceWorker');
    renderHook(() => useServiceWorker());

    // Allow async registration
    await vi.advanceTimersByTimeAsync(0);

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  });

  it('cleans legacy caches before registering the current worker', async () => {
    mockCaches.keys.mockResolvedValueOnce(['whatsapp-crm-v2']);
    sessionStorage.setItem('sw-cache-reset-done', '1');

    const { useServiceWorker } = await import('@/hooks/useServiceWorker');
    renderHook(() => useServiceWorker());

    await vi.advanceTimersByTimeAsync(0);

    expect(navigator.serviceWorker.getRegistrations).toHaveBeenCalled();
    expect(mockUnregister).toHaveBeenCalled();
    expect(caches.delete).toHaveBeenCalledWith('whatsapp-crm-v2');
    expect(navigator.serviceWorker.register).toHaveBeenCalled();
  });

  it('does not crash when serviceWorker is unavailable', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { useServiceWorker } = await import('@/hooks/useServiceWorker');
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });
});
