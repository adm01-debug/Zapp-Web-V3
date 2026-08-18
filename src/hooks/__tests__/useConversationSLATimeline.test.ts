import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import React from 'react';
import type { SLATimelineAggregateRow } from '@/integrations/datasource/rpcCatalog';

const mockDbGet = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/datasource/db', () => ({
  dbGet: (...args: unknown[]) => mockDbGet(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { from: vi.fn() },
}));

import { useConversationSLATimeline } from '@/hooks/useConversationManagement';
import { RPC } from '@/integrations/datasource/rpcCatalog';

const JID = '5511999999999@s.whatsapp.net';
const T_INBOUND = '2026-08-18T10:00:00.000Z';
const T_OUTBOUND = '2026-08-18T10:05:00.000Z';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    queryClient,
  };
}

function mockRow(overrides: Partial<SLATimelineAggregateRow> = {}): SLATimelineAggregateRow {
  return {
    first_inbound_at: null,
    first_outbound_at: null,
    last_message_at: null,
    total_messages: 0,
    ...overrides,
  };
}

describe('useConversationSLATimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('conversa vazia: 1 linha com NULLs/count 0 → timeline vazia sem quebrar', async () => {
    mockDbGet.mockResolvedValue({ data: mockRow(), error: null });
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useConversationSLATimeline(JID, null), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data;
    expect(data).toMatchObject({
      firstContactAt: null,
      firstResponseAt: null,
      firstResponseDurationMs: null,
      lastMessageAt: null,
      isAwaitingFirstResponse: false,
      awaitingMs: null,
      totalMessages: 0,
    });

    // prova: staleTime é 10min (incidente 18/08)
    const query = queryClient.getQueryCache().findAll()[0];
    const options = query?.options as { staleTime?: number } | undefined;
    expect(options?.staleTime).toBe(1000 * 60 * 10);

    // prova: dbGet recebe o signal do queryFn como 3º argumento
    expect(mockDbGet).toHaveBeenCalledTimes(1);
    const [def, params, opts] = mockDbGet.mock.calls[0] as [
      typeof RPC.slaTimelineAggregate,
      { p_remote_jid: string },
      { signal: AbortSignal },
    ];
    expect(def.name).toBe('rpc_sla_timeline_aggregate');
    expect(params).toEqual({ p_remote_jid: JID });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('conversa normal: first_inbound/first_outbound/last corretos e fórmulas preservadas', async () => {
    mockDbGet.mockResolvedValue({
      data: mockRow({
        first_inbound_at: T_INBOUND,
        first_outbound_at: T_OUTBOUND,
        last_message_at: T_OUTBOUND,
        total_messages: 3,
      }),
      error: null,
    });
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useConversationSLATimeline(JID, null), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data;
    expect(data).toMatchObject({
      firstContactAt: new Date(T_INBOUND),
      firstResponseAt: new Date(T_OUTBOUND),
      firstResponseDurationMs: 5 * 60 * 1000, // 10:05 - 10:00
      lastMessageAt: new Date(T_OUTBOUND),
      isAwaitingFirstResponse: false,
      awaitingMs: null,
      totalMessages: 3,
    });

    // fora do estado "aguardando" → refetchInterval desligado
    const query = queryClient.getQueryCache().findAll()[0];
    const options = query?.options as {
      refetchInterval?: (q: Query) => number | false | undefined;
    } | undefined;
    expect(options?.refetchInterval?.(query as Query)).toBe(false);
  });

  it('aguardando primeira resposta: isAwaitingFirstResponse=true, awaitingMs>0 e refetchInterval 30s', async () => {
    mockDbGet.mockResolvedValue({
      data: mockRow({
        first_inbound_at: T_INBOUND,
        first_outbound_at: null,
        last_message_at: T_INBOUND,
        total_messages: 1,
      }),
      error: null,
    });
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useConversationSLATimeline(JID, null), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data;
    expect(data).toMatchObject({
      firstContactAt: new Date(T_INBOUND),
      firstResponseAt: null,
      firstResponseDurationMs: null,
      isAwaitingFirstResponse: true,
      totalMessages: 1,
    });
    expect(data?.awaitingMs).toBeGreaterThan(0);

    // aguardando resposta → refetchInterval de 30s (comportamento original preservado)
    const query = queryClient.getQueryCache().findAll()[0];
    const options = query?.options as {
      refetchInterval?: (q: Query) => number | false | undefined;
    } | undefined;
    expect(options?.refetchInterval?.(query as Query)).toBe(30_000);
  });
});
