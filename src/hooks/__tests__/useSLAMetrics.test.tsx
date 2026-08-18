import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/lib/logger');

import { useSLAMetrics } from '@/hooks/useSLAMetrics';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockSLAData = [
  {
    id: 's1',
    contact_id: 'c1',
    first_response_breached: false,
    resolution_breached: false,
    first_response_at: '2024-01-01T10:05:00Z',
    first_message_at: '2024-01-01T10:00:00Z',
    resolved_at: '2024-01-01T11:00:00Z',
  },
  {
    id: 's2',
    contact_id: 'c2',
    first_response_breached: true,
    resolution_breached: true,
    first_response_at: null,
    first_message_at: '2024-01-01T10:00:00Z',
    resolved_at: null,
  },
];

describe('useSLAMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockSLAData, error: null }),
          lte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockSLAData, error: null }),
          }),
        }),
        order: vi.fn().mockResolvedValue({ data: mockSLAData, error: null }),
      }),
    });
  });

  it('fetches SLA metrics', async () => {
    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
  });

  it('handles loading state correctly', () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(new Promise(() => {})),
        }),
        order: vi.fn().mockReturnValue(new Promise(() => {})),
      }),
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('handles empty SLA data', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('handles fetch errors gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
      }),
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  // ── E67.5: LEFT join — conversas SEM contato vinculado NÃO podem ser
  // subreportadas (antes: `contacts!inner(assigned_to)` excluía a row inteira).
  it('E67: inclui conversas sem contato no overall (não subreporta)', async () => {
    const rowsWithUnassigned = [
      {
        id: 's1',
        contact_id: 'c1',
        contacts: { assigned_to: 'a1' },
        first_response_at: '2024-01-01T10:05:00Z',
        first_response_breached: false,
        resolved_at: '2024-01-01T11:00:00Z',
        resolution_breached: false,
      },
      {
        id: 's2',
        contact_id: 'c2',
        contacts: null, // LEFT join: conversa sem contato vinculado
        first_response_at: null,
        first_response_breached: true,
        resolved_at: null,
        resolution_breached: true,
      },
    ];

    // o hook para a cadeia no `.gte()` — o builder precisa resolver com {data, error}
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockResolvedValue({ data: rowsWithUnassigned, error: null }),
      }),
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // overall conta TODAS as conversas (2), incluindo a sem contato
    expect(result.current.data?.overall.totalConversations).toBe(2);
    expect(result.current.data?.overall.firstResponse.breached).toBe(1);
    expect(result.current.data?.overall.resolution.breached).toBe(1);

    // byAgent agrega só conversas com agente atribuído (sem contato = sem agente)
    expect(result.current.data?.byAgent).toHaveLength(1);
    expect(result.current.data?.byAgent[0]?.agentId).toBe('a1');
  });

  it('E67: usa embed LEFT (contacts(assigned_to)), nunca contacts!inner', async () => {
    const selectSpy = vi.fn(() => ({
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    mockFrom.mockReturnValue({
      select: selectSpy,
    });

    renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });
    await waitFor(() => expect(selectSpy).toHaveBeenCalled());

    const slaSelect = (selectSpy.mock.calls as unknown[][])
      .map((c) => String(c[0] ?? ''))
      .find((cols) => cols.includes('contacts'));
    expect(slaSelect).toBeDefined();
    expect(slaSelect).toContain('contacts(assigned_to)');
    expect(slaSelect).not.toContain('!inner');
  });
});
