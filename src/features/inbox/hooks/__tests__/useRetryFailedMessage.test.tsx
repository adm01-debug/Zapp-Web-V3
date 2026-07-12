// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRetryFailedMessage } from '../useRetryFailedMessage';

const mockGetSession = vi.fn();
const mockRpc = vi.fn();
const mockToast = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (payload: unknown) => mockToast(payload),
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { Wrapper, client };
}

const authed = { data: { session: { user: { id: 'u1' } } } };

beforeEach(() => {
  mockGetSession.mockReset();
  mockRpc.mockReset();
  mockToast.mockReset();
});

describe('useRetryFailedMessage', () => {
  it('sucesso: chama RPC, invalida cache e mostra toast', async () => {
    mockGetSession.mockResolvedValue(authed);
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { Wrapper, client } = makeWrapper();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRetryFailedMessage(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ failedMessageId: 'fm-1', messageId: 'm-1' });
    });

    expect(mockRpc).toHaveBeenCalledWith('rpc_dlq_retry_now', { p_id: 'fm-1' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['message-send-history', 'm-1'] });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reenvio enfileirado' }),
    );
  });

  it('bloqueia sem sessão', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRetryFailedMessage(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({ failedMessageId: 'fm-1', messageId: 'm-1' }),
    ).rejects.toThrow(/[Aa]utentica/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rate-limit: 2º clique dentro de 30s não chama RPC', async () => {
    mockGetSession.mockResolvedValue(authed);
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRetryFailedMessage(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ failedMessageId: 'fm-1', messageId: 'm-1' });
    });
    await expect(
      result.current.mutateAsync({ failedMessageId: 'fm-1', messageId: 'm-1' }),
    ).rejects.toThrow(/[Aa]guarde/);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('42501: toast de sem permissão', async () => {
    mockGetSession.mockResolvedValue(authed);
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'forbidden' } });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRetryFailedMessage(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({ failedMessageId: 'fm-1', messageId: 'm-1' }),
    ).rejects.toThrow();
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/permiss/i) }),
      );
    });
  });
});
