import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { useSLAHistory } from '@/features/sla/hooks/useSLAHistory';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useSLAHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
  });

  it('initializes with loading state', () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('fetches data for 7d period', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeDefined();
  });

  it('fetches data for 30d period', async () => {
    const { result } = renderHook(() => useSLAHistory('30d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('fetches data for 90d period', async () => {
    const { result } = renderHook(() => useSLAHistory('90d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('handles empty data gracefully', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.totals.totalBreaches).toBe(0);
    expect(result.current.data?.totals.overallSLARate).toBeDefined();
  });

  it('handles SLA records with breaches', async () => {
    const now = new Date();
    const mockRecords = [
      {
        id: '1',
        contact_id: 'c1',
        first_response_breached: true,
        resolution_breached: false,
        created_at: now.toISOString(),
        first_message_at: now.toISOString(),
        first_response_at: now.toISOString(),
        resolved_at: null,
      },
      {
        id: '2',
        contact_id: 'c2',
        first_response_breached: false,
        resolution_breached: true,
        created_at: now.toISOString(),
        first_message_at: now.toISOString(),
        first_response_at: now.toISOString(),
        resolved_at: now.toISOString(),
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRecords, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.totals.firstResponseBreaches).toBe(1);
    expect(result.current.data?.totals.resolutionBreaches).toBe(1);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    });

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    // With useQuery + retry:false, it will error; data stays null
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('data contains dailyData array', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Array.isArray(result.current.data?.dailyData)).toBe(true);
    expect(result.current.data!.dailyData.length).toBeGreaterThan(0);
  });

  it('data contains trends', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.trends).toBeDefined();
    expect(result.current.data?.trends.overall).toBeDefined();
  });

  it('defaults to 30d when no period provided', async () => {
    const { result } = renderHook(() => useSLAHistory(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeDefined();
  });

  // ── E67.6: o DIA/PERÍODO entra na queryKey — virada de dia = chave nova =
  // refetch obrigatório (antes: `new Date()` só dentro do queryFn, chave fixa).
  it('E67: inclui a data de início na queryKey', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-08-10T12:00:00Z'));

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useSLAHistory('7d'), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const entries = qc.getQueryCache().findAll({ queryKey: ['sla-history'] });
      expect(entries.length).toBeGreaterThan(0);
      // key = ['sla-history', '7d', <ISO do dia de início>]
      const key = entries[0]?.queryKey as string[];
      expect(key[2]).toBeDefined();
      expect(key[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(key[2]).not.toBe('7d');
    } finally {
      vi.useRealTimers();
    }
  });

  it('E67: virada de dia gera NOVA queryKey e novo fetch (invalidação por dia)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-08-10T12:00:00Z'));

      const gteSpy = vi.fn();
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: gteSpy.mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      const first = renderHook(() => useSLAHistory('7d'), { wrapper });
      await waitFor(() => expect(first.result.current.loading).toBe(false));
      const firstGte = gteSpy.mock.calls[0]?.[1] as string;
      first.unmount();

      // vira o dia (12h depois)
      vi.setSystemTime(new Date('2026-08-11T00:30:00Z'));
      gteSpy.mockClear();

      const second = renderHook(() => useSLAHistory('7d'), { wrapper });
      await waitFor(() => expect(second.result.current.loading).toBe(false));
      const secondGte = gteSpy.mock.calls[0]?.[1] as string;

      // janela de 7d deslocou — fetch novo obrigatório (chave mudou)
      expect(secondGte).not.toBe(firstGte);
      expect(secondGte).toBeDefined();

      // ambas as chaves (dias distintos) convivem no cache
      const keys = qc
        .getQueryCache()
        .findAll({ queryKey: ['sla-history'] })
        .map((e) => e.queryKey[2]);
      expect(new Set(keys).size).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
