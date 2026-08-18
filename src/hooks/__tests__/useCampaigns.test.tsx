import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }));

import { useCampaigns } from '@/hooks/useCampaigns';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockCampaigns = [
  { id: 'c1', name: 'Promo 1', status: 'draft', total_contacts: 100, sent_count: 0 },
  { id: 'c2', name: 'Promo 2', status: 'completed', total_contacts: 50, sent_count: 50 },
];

/** Chain base para update/delete com select.maybeSingle (impl real do hook). */
function updateChain(resolveValue: { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>) {
  return {
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(resolveValue) }),
    }),
  };
}

describe('useCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockCampaigns, error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c3', name: 'New' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue(updateChain({ data: { id: 'c1', status: 'sending' }, error: null })),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('fetches campaigns list', async () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.campaigns).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith('campaigns');
  });

  it('exposes create, update, delete mutations', () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    expect(result.current.createCampaign).toBeDefined();
    expect(result.current.updateCampaign).toBeDefined();
    expect(result.current.deleteCampaign).toBeDefined();
  });

  it('creates a campaign', async () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.createCampaign.mutate({ name: 'New Campaign', message_content: 'Hello' });
    });
    expect(mockFrom).toHaveBeenCalledWith('campaigns');
    expect(mockToastSuccess).toHaveBeenCalledWith('Campanha criada com sucesso!');
  });

  it('handles loading state', () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('updateCampaign envia UPDATE real com payload e id (E62-62.8)', async () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    const fromSpy = mockFrom;
    await act(async () => {
      result.current.updateCampaign.mutate({ id: 'c1', status: 'sending' });
    });
    expect(fromSpy).toHaveBeenCalledWith('campaigns');
    const updateFn = fromSpy.mock.results[fromSpy.mock.results.length - 1]?.value.update;
    expect(updateFn).toHaveBeenCalledWith({ status: 'sending' });
    const eqFn = updateFn.mock.results[updateFn.mock.results.length - 1]?.value.eq;
    expect(eqFn).toHaveBeenCalledWith('id', 'c1');
    expect(mockToastSuccess).toHaveBeenCalledWith('Campanha atualizada!');
  });

  it('deleteCampaign envia DELETE real com id (E62-62.8)', async () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    const fromSpy = mockFrom;
    await act(async () => {
      result.current.deleteCampaign.mutate('c1');
    });
    expect(fromSpy).toHaveBeenCalledWith('campaigns');
    const deleteFn = fromSpy.mock.results[fromSpy.mock.results.length - 1]?.value.delete;
    expect(deleteFn).toHaveBeenCalledWith();
    const eqFn = deleteFn.mock.results[deleteFn.mock.results.length - 1]?.value.eq;
    expect(eqFn).toHaveBeenCalledWith('id', 'c1');
    expect(mockToastSuccess).toHaveBeenCalledWith('Campanha excluída!');
  });

  it('updateCampaign com 403 RLS mostra mensagem clara (não genérica) (E62-62.8)', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue(
        updateChain({ data: null, error: { message: 'new row violates row-level security policy' } })
      ),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.updateCampaign.mutate({ id: 'c1', status: 'sending' });
    });
    const errorMsg = mockToastError.mock.calls[mockToastError.mock.calls.length - 1]?.[0] as string;
    expect(errorMsg).toContain('Sem permissão');
    expect(errorMsg).not.toContain('Erro: new row');
  });

  it('deleteCampaign com 403 RLS mostra mensagem clara (E62-62.8)', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue(updateChain({ data: null, error: null })),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'permission denied for table campaigns' } }),
      }),
    });
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.deleteCampaign.mutate('c1');
    });
    const errorMsg = mockToastError.mock.calls[mockToastError.mock.calls.length - 1]?.[0] as string;
    expect(errorMsg).toContain('Sem permissão');
    expect(errorMsg).not.toContain('Erro: permission denied');
  });
});
