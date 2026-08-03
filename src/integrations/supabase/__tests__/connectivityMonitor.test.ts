/**
 * Testes do monitor de conectividade com o Supabase.
 *
 * Cobre:
 *   - Falha de rede no ping → status 'backend-down'
 *   - Qualquer resposta HTTP (inclusive 401 sem apikey) → status 'online'
 *   - reportSupabaseRequestFailure acelera a detecção
 *   - Eventos window online/offline
 *   - Heartbeat inicia com o 1º subscriber e para com o último
 *   - Debounce de pings espontâneos
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __resetSupabaseConnectivityForTests,
  getSupabaseConnectivityStatus,
  pingSupabaseBackend,
  reportSupabaseRequestFailure,
  subscribeSupabaseConnectivity,
} from '../connectivityMonitor';

const flush = () => new Promise((resolve) => setTimeout(resolve, 25));

beforeEach(() => {
  __resetSupabaseConnectivityForTests();
});

afterEach(() => {
  __resetSupabaseConnectivityForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connectivityMonitor — pingSupabaseBackend', () => {
  it('marca backend-down quando o fetch falha (rede/timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await pingSupabaseBackend(true);
    expect(getSupabaseConnectivityStatus()).toBe('backend-down');
  });

  it('marca online quando o servidor responde (qualquer status HTTP, ex. 401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await pingSupabaseBackend(true);
    expect(getSupabaseConnectivityStatus()).toBe('online');
  });

  it('marca online quando o servidor responde 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await pingSupabaseBackend(true);
    expect(getSupabaseConnectivityStatus()).toBe('online');
  });

  it('debounce: pings espontâneos consecutivos disparam apenas um fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await pingSupabaseBackend();
    await pingSupabaseBackend();
    await pingSupabaseBackend();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('connectivityMonitor — reportSupabaseRequestFailure', () => {
  it('marca backend-down imediatamente e re-pinga para confirmar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await pingSupabaseBackend(true);
    expect(getSupabaseConnectivityStatus()).toBe('online');

    reportSupabaseRequestFailure();
    // Marcação é síncrona; o re-ping de confirmação é assíncrono.
    expect(getSupabaseConnectivityStatus()).toBe('backend-down');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mantém offline quando o browser está offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const unsub = subscribeSupabaseConnectivity(() => {});
    window.dispatchEvent(new Event('offline'));
    reportSupabaseRequestFailure();
    expect(getSupabaseConnectivityStatus()).toBe('offline');
    unsub();
  });
});

describe('connectivityMonitor — eventos do browser', () => {
  it('evento offline marca offline imediatamente', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const unsub = subscribeSupabaseConnectivity(() => {});
    window.dispatchEvent(new Event('offline'));
    expect(getSupabaseConnectivityStatus()).toBe('offline');
    unsub();
  });

  it('evento online re-pinga e volta para online', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    subscribeSupabaseConnectivity(() => {});

    window.dispatchEvent(new Event('offline'));
    expect(getSupabaseConnectivityStatus()).toBe('offline');

    window.dispatchEvent(new Event('online'));
    await flush();
    expect(getSupabaseConnectivityStatus()).toBe('online');
  });
});

describe('connectivityMonitor — ciclo de vida do heartbeat', () => {
  it('inicia com o primeiro subscriber e para com o último', () => {
    vi.useFakeTimers();
    expect(vi.getTimerCount()).toBe(0);

    const unsub1 = subscribeSupabaseConnectivity(() => {});
    expect(vi.getTimerCount()).toBe(1); // setInterval do heartbeat

    const unsub2 = subscribeSupabaseConnectivity(() => {});
    expect(vi.getTimerCount()).toBe(1); // não duplica

    unsub1();
    expect(vi.getTimerCount()).toBe(1); // ainda há 1 subscriber

    unsub2();
    expect(vi.getTimerCount()).toBe(0); // último saiu → heartbeat para
  });

  it('notifica listeners quando o status muda', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const listener = vi.fn();
    subscribeSupabaseConnectivity(listener);

    await pingSupabaseBackend(true);
    expect(listener).toHaveBeenCalledWith('backend-down', expect.objectContaining({ latencyMs: expect.any(Number) }));
  });
});
