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
};

describe('useServiceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnregister.mockResolvedValue(true);
    vi.useFakeTimers();
    sessionStorage.clear();
    // shouldSkipServiceWorker() retorna true se import.meta.env.DEV=true.
    // Em vitest com mode='test', DEV deveria ser false, mas vi.stubEnv garante
    // isso independentemente do modo configurado.
    vi.stubEnv('DEV', false);

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
    vi.unstubAllEnvs();
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
    // Cache name deve casar com o filtro /^(workbox-|zapp-)/i do novo comportamento.
    // Nomes que nao casam sao tratados como caches legitimos do HTTP (nao purgados).
    mockCaches.keys.mockResolvedValueOnce(['workbox-precache-v2']);
    // Simula que o cleanup JA FOI FEITO (localStorage flag = '1'), ou seja,
    // estamos na segunda visita apos o reload. Nesse cenario, o cleanup
    // purga os caches mas NAO recarrega — permitindo o registro do SW.
    localStorage.setItem('sw-cache-reset-done', '1');

    const { useServiceWorker } = await import('@/hooks/useServiceWorker');
    renderHook(() => useServiceWorker());

    await vi.advanceTimersByTimeAsync(0);

    expect(navigator.serviceWorker.getRegistrations).toHaveBeenCalled();
    expect(mockUnregister).toHaveBeenCalled();
    expect(caches.delete).toHaveBeenCalledWith('workbox-precache-v2');
    // Apos cleanup sem reload, o SW deve registrar.
    expect(navigator.serviceWorker.register).toHaveBeenCalled();
  });

  it('does not purge non-workbox/zapp caches (HTTP cache is legitimate)', async () => {
    // Cache name que NAO casa com /^(workbox-|zapp-)/i — deve ser preservado.
    mockCaches.keys.mockResolvedValueOnce(['whatsapp-crm-v2', 'http-cache-v1']);
    localStorage.clear();

    const { useServiceWorker } = await import('@/hooks/useServiceWorker');
    renderHook(() => useServiceWorker());

    await vi.advanceTimersByTimeAsync(0);

    // Nao deve chamar getRegistrations nem delete — caches sao legitimos (HTTP).
    expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(caches.delete).not.toHaveBeenCalled();
    // SW deve registrar normalmente apos skip do cleanup.
    expect(navigator.serviceWorker.register).toHaveBeenCalled();
  });

  it('does not purge when SW already controls the page', async () => {
    // Simula SW ja controlando a pagina.
    const origController = navigator.serviceWorker.controller;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ...navigator.serviceWorker,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock needs partial ServiceWorker type
        controller: { scriptURL: '/sw.js' } as any,
      },
      writable: true,
      configurable: true,
    });
    mockCaches.keys.mockResolvedValueOnce(['workbox-precache-v2']);
    localStorage.clear();

    const { useServiceWorker } = await import('@/hooks/useServiceWorker');
    renderHook(() => useServiceWorker());

    await vi.advanceTimersByTimeAsync(0);

    // Com SW controller ativo, nao deve purgar nada.
    expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(caches.delete).not.toHaveBeenCalled();

    // Restaura
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: origController } as Partial<ServiceWorkerContainer>,
      writable: true,
      configurable: true,
    });
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
