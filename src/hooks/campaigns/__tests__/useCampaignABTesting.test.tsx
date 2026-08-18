import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args), rpc: mockRpc },
}));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ toast: mockToast }));

import { useCampaignABTesting } from '@/hooks/campaigns/useCampaignABTesting';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const abRows = [
  {
    id: 'v-a',
    campaign_id: 'c1',
    variant_name: 'A',
    message_content: 'msg A',
    send_count: 10,
    delivered_count: 8,
    read_count: 4,
    response_count: 2,
    is_winner: false,
    variant_weight: 1,
  },
  {
    id: 'v-b',
    campaign_id: 'c1',
    variant_name: 'B',
    message_content: 'msg B',
    send_count: 20,
    delivered_count: 10,
    read_count: 5,
    response_count: 3,
    is_winner: false,
    variant_weight: 3,
  },
];

function selectChain() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: abRows, error: null }) }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  };
}

describe('useCampaignABTesting (engine A/B real — E62-62.6/62.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(selectChain());
    mockRpc.mockResolvedValue({ data: { variant_id: 'v-a', variant_name: 'A', assigned: true }, error: null });
  });

  it('carrega variantes reais do banco com peso (variant_weight)', async () => {
    const { result } = renderHook(() => useCampaignABTesting('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.variants.length).toBe(2));
    expect(mockFrom).toHaveBeenCalledWith('campaign_ab_variants');
    expect(result.current.variants[1].variant_weight).toBe(3);
  });

  it('assignVariant sem variantId explícito escolhe pela engine ponderada e persiste via RPC', async () => {
    const { result } = renderHook(() => useCampaignABTesting('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.variants.length).toBe(2));
    let assigned: unknown = null;
    await act(async () => {
      assigned = await result.current.assignVariant('contact-1');
    });
    // peso 3 de 4 → B é a escolha esperada com random alto; a chamada RPC é o contrato real
    expect(mockRpc).toHaveBeenCalledWith('rpc_campaign_assign_variant' as never, {
      p_campaign_id: 'c1',
      p_contact_id: 'contact-1',
      p_variant_id: expect.any(String),
    });
    expect(assigned).toEqual({ variant_id: 'v-a', variant_name: 'A', assigned: true });
  });

  it('assignVariant com variantId explícito repassa ao RPC sem passar pela seleção', async () => {
    const { result } = renderHook(() => useCampaignABTesting('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.variants.length).toBe(2));
    await act(async () => {
      await result.current.assignVariant('contact-2', 'v-b');
    });
    expect(mockRpc).toHaveBeenCalledWith('rpc_campaign_assign_variant' as never, {
      p_campaign_id: 'c1',
      p_contact_id: 'contact-2',
      p_variant_id: 'v-b',
    });
  });

  it('assignVariant com erro RPC retorna null e mostra toast', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function' } });
    const { result } = renderHook(() => useCampaignABTesting('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.variants.length).toBe(2));
    let assigned: unknown = 'sentinel';
    await act(async () => {
      assigned = await result.current.assignVariant('contact-3', 'v-b');
    });
    expect(assigned).toBeNull();
    expect(mockToast).toHaveBeenCalled();
  });

  it('addVariant persiste INSERT real e invalida cache', async () => {
    const { result } = renderHook(() => useCampaignABTesting('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.variants.length).toBe(2));
    let ok: boolean | null = null;
    await act(async () => {
      ok = await result.current.addVariant('C', 'msg C');
    });
    expect(ok).toBe(true);
    const insertFn = mockFrom.mock.results[mockFrom.mock.results.length - 1]?.value.insert;
    expect(insertFn).toHaveBeenCalledWith({
      campaign_id: 'c1',
      variant_name: 'C',
      message_content: 'msg C',
    });
  });

  it('deleteVariant e declareWinner seguem operando (regressão 62.7)', async () => {
    const { result } = renderHook(() => useCampaignABTesting('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.variants.length).toBe(2));
    await act(async () => {
      await result.current.deleteVariant('v-b');
    });
    await act(async () => {
      await result.current.declareWinner('v-a');
    });
    expect(mockFrom).toHaveBeenCalledWith('campaign_ab_variants');
  });
});
