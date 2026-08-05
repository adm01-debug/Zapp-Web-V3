import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { useMarketingBudgets } from '@/hooks/useMarketingBudgets';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockBudgets = [
  { id: 'b1', name: 'WhatsApp Marketing', period: '2026-08', limit_usd: 500, current_usd: 120, alert_threshold: 80, is_active: true },
  { id: 'b2', name: 'Campanhas', period: '2026-08', limit_usd: 1000, current_usd: 0, alert_threshold: null, is_active: false },
];

describe('useMarketingBudgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockBudgets, error: null }),
      }),
    });
  });

  it('fetches budgets list ordered by created_at desc', async () => {
    const { result } = renderHook(() => useMarketingBudgets(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith('budgets');
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].name).toBe('WhatsApp Marketing');
  });

  it('surfaces query errors', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') }),
      }),
    });
    const { result } = renderHook(() => useMarketingBudgets(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
