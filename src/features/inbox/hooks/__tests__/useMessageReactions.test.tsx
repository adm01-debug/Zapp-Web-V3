import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactionsBatchProvider } from '../reactions/usePreloadConversationReactions';

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
  };
  return {
    supabase: {
      from: (...args: unknown[]) => mockFrom(...args),
      rpc: (...args: unknown[]) => mockRpc(...args),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      auth: {
        onAuthStateChange: vi
          .fn()
          .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    },
  };
});

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger');

import { useMessageReactions } from '../useMessageReactions';

function createWrapper(messageIds?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      {messageIds ? (
        <ReactionsBatchProvider messageIds={messageIds}>{children}</ReactionsBatchProvider>
      ) : (
        children
      )}
    </QueryClientProvider>
  );
}

const mockReactions = [
  {
    id: 'r1',
    message_id: 'm1',
    user_id: 'u1',
    contact_id: null,
    emoji: '👍',
    created_at: '2024-01-01',
  },
  {
    id: 'r2',
    message_id: 'm1',
    user_id: null,
    contact_id: 'c1',
    emoji: '❤️',
    created_at: '2024-01-02',
  },
];

describe('useMessageReactions (FIX N+1: batch provider)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockRpc.mockResolvedValue({ data: mockReactions, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', name: 'Agent' }, error: null }),
            }),
            in: vi.fn().mockResolvedValue({ data: [{ id: 'u1', name: 'Agent' }], error: null }),
          }),
        };
      }
      if (table === 'message_reactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockReactions, error: null }),
            in: vi.fn().mockResolvedValue({ data: mockReactions, error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('sem provider: mantém o GET individual por mensagem (regressão)', async () => {
    const { result } = renderHook(() => useMessageReactions('m1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.reactions).toHaveLength(2);
    // Batch não foi usado
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('com provider: usa 1 GET batch e NENHUM GET individual por mensagem', async () => {
    const { result } = renderHook(() => useMessageReactions('m1'), {
      wrapper: createWrapper(['m1', 'm2']),
    });
    await waitFor(() => expect(result.current.reactions).toHaveLength(2));
    // Batch via RPC: exatamente 1 chamada
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('rpc_get_reactions_batch', {
      p_message_ids: ['m1', 'm2'],
    });
    // Nenhum GET individual `.eq('message_id', ...)` foi disparado
    const reactionCalls = mockFrom.mock.calls.filter(([t]) => t === 'message_reactions');
    expect(reactionCalls).toHaveLength(0);
    // Reações vieram do cache primado pelo batch
    expect(result.current.reactions).toHaveLength(2);
  });

  it('com provider: enquanto o batch está pendente, NÃO dispara GET individual; após resolver, lê do cache', async () => {
    let resolveBatch!: (v: unknown) => void;
    mockRpc.mockReturnValue(
      new Promise((res) => {
        resolveBatch = res;
      })
    );

    const { result } = renderHook(() => useMessageReactions('m1'), {
      wrapper: createWrapper(['m1']),
    });

    // Batch ainda pendente: nenhum GET individual
    expect(mockFrom.mock.calls.filter(([t]) => t === 'message_reactions')).toHaveLength(0);
    expect(result.current.reactions).toEqual([]);

    await act(async () => {
      resolveBatch({ data: mockReactions, error: null });
    });

    await waitFor(() => expect(result.current.reactions).toHaveLength(2));
    expect(mockFrom.mock.calls.filter(([t]) => t === 'message_reactions')).toHaveLength(0);
  });

  it('com provider: se a RPC falhar, usa 1 GET fallback .in() e ainda evita o N+1', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });

    const { result } = renderHook(() => useMessageReactions('m1'), {
      wrapper: createWrapper(['m1', 'm2']),
    });
    await waitFor(() => expect(result.current.reactions).toHaveLength(2));

    // Fallback: 1 chamada .in() em message_reactions, nenhum .eq() individual
    const reactionCalls = mockFrom.mock.calls.filter(([t]) => t === 'message_reactions');
    expect(reactionCalls).toHaveLength(1);
    expect(result.current.reactions).toHaveLength(2);
  });
});
