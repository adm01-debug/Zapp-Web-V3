import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { QUERY_STALE_TIMES } from '@/lib/queryStaleTimes';
import { queryKeys } from '@/services/api/queryKeys';

type Resolver = (result: { data?: unknown; error?: unknown }) => unknown;

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger');

import { useSLAConfigurations } from '@/features/sla/hooks/useSLAConfigurations';

const configRows = [
  {
    id: 'sla-1',
    name: 'SLA Crítico',
    first_response_minutes: 5,
    resolution_minutes: 30,
    priority: 'critical',
    is_default: false,
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'sla-2',
    name: 'SLA Padrão',
    first_response_minutes: 15,
    resolution_minutes: 120,
    priority: 'medium',
    is_default: true,
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

/** Chain que devolve rows no fetch e sucesso (error: null) nas mutações. */
function mockHappyChain(data: unknown[]) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data, error: null }),
    }),
    update: () => ({ eq: () => ({ then: (r: Resolver) => r({ error: null }) }) }),
    insert: () => ({ then: (r: Resolver) => r({ error: null }) }),
    delete: () => ({ eq: () => ({ then: (r: Resolver) => r({ error: null }) }) }),
  });
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe('useSLAConfigurations — contrato E67 (67.4 staleTime)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHappyChain(configRows);
  });

  it('NÃO usa staleTime: Infinity — mudanças de admin refletem sem reload', async () => {
    const { qc, wrapper } = createWrapper();
    const { result } = renderHook(() => useSLAConfigurations(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const entries = qc.getQueryCache().findAll({
      queryKey: queryKeys.sla.configurations(),
    });
    expect(entries.length).toBeGreaterThan(0);
    const staleTime = (entries[0]?.options as { staleTime?: number } | undefined)?.staleTime;
    expect(staleTime).not.toBe(Infinity);
    expect(staleTime).toBe(QUERY_STALE_TIMES.slaConfigurations);
  });

  it('saveMutation invalida a lista após salvar (refetch imediato)', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSLAConfigurations(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const fetchesBefore = mockFrom.mock.calls.length;

    await act(async () => {
      await result.current.saveMutation.mutateAsync({
        name: 'SLA Novo',
        first_response_minutes: 10,
        resolution_minutes: 60,
        priority: 'low',
        is_default: false,
      });
    });

    // invalidação pós-mutação → novo fetch da lista
    expect(mockFrom.mock.calls.length).toBeGreaterThan(fetchesBefore);
  });

  it('toggleMutation otimista reverte ao estado anterior em erro', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSLAConfigurations(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.configs[0]?.is_active).toBe(true);

    // UPDATE fica PENDENTE (promessa controlada) até resolvermos o erro
    let resolveUpdate: (v: unknown) => void = () => undefined;
    const updateGate = new Promise<unknown>((r) => {
      resolveUpdate = r;
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: configRows, error: null }),
      }),
      update: () => ({ eq: () => ({ then: (r: (value: unknown) => unknown) => updateGate.then(r) }) }),
      insert: () => ({ then: (r: (value: unknown) => unknown) => r({ error: null }) }),
      delete: () => ({ eq: () => ({ then: (r: (value: unknown) => unknown) => r({ error: null }) }) }),
    });

    // dispara a mutation; onMutate é async (cancelQueries) → aguardar o flush
    await act(async () => {
      result.current.toggleMutation.mutate({ id: 'sla-1', is_active: false });
    });

    // otimista aplicado (enquanto a mutation ainda está pendente no gate)
    await waitFor(() => expect(result.current.configs[0]?.is_active).toBe(false));

    // UPDATE falha → rollback ao snapshot anterior
    await act(async () => {
      resolveUpdate({ error: new Error('falha') });
    });

    await waitFor(() => expect(result.current.configs[0]?.is_active).toBe(true));
  });
});
