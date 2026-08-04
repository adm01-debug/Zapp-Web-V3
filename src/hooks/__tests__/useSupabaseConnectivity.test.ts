/**
 * Testes do hook useSupabaseConnectivity.
 *
 * Verifica que o hook reflete o estado do monitor singleton e que o retry
 * dispara uma checagem imediata.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSupabaseConnectivity } from '../useSupabaseConnectivity';
import {
  __resetSupabaseConnectivityForTests,
  reportSupabaseRequestFailure,
} from '@/integrations/supabase/connectivityMonitor';

beforeEach(() => {
  __resetSupabaseConnectivityForTests();
});

afterEach(() => {
  __resetSupabaseConnectivityForTests();
  vi.unstubAllGlobals();
});

describe('useSupabaseConnectivity', () => {
  it('inicia online quando o backend responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { result } = renderHook(() => useSupabaseConnectivity());

    await waitFor(() => expect(result.current.status).toBe('online'));
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isBackendDown).toBe(false);
    expect(typeof result.current.retryNow).toBe('function');
  });

  it('reflete backend-down quando o monitor detecta falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useSupabaseConnectivity());

    act(() => {
      reportSupabaseRequestFailure();
    });

    await waitFor(() => expect(result.current.status).toBe('backend-down'));
    expect(result.current.isOnline).toBe(false);
    expect(result.current.isBackendDown).toBe(true);
  });

  it('retryNow força uma nova checagem', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSupabaseConnectivity());

    await waitFor(() => expect(result.current.status).toBe('backend-down'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retryNow();
    });

    await waitFor(() => expect(result.current.status).toBe('online'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
