import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock('@/lib/logger');

import { useGlobalSettings } from '@/hooks/useGlobalSettings';

describe('useGlobalSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: 's1', key: 'theme', value: 'dark', description: 'App theme' },
            { id: 's2', key: 'language', value: 'pt-BR', description: 'Language' },
          ],
          error: null,
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: 's3', key: 'new', value: 'val' }, error: null }),
        }),
      }),
    });
  });

  it('fetches global settings', async () => {
    const { result } = renderHook(() => useGlobalSettings(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('global_settings');
  });

  it('exposes getSetting function', async () => {
    const { result } = renderHook(() => useGlobalSettings(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.getSetting).toBe('function');
  });

  it('exposes updateSetting function', () => {
    const { result } = renderHook(() => useGlobalSettings(), { wrapper: makeWrapper() });
    expect(typeof result.current.updateSetting).toBe('function');
  });

  it('exposes addSetting function', () => {
    const { result } = renderHook(() => useGlobalSettings(), { wrapper: makeWrapper() });
    expect(typeof result.current.addSetting).toBe('function');
  });

  it('getSetting returns null for unknown key', async () => {
    const { result } = renderHook(() => useGlobalSettings(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getSetting('nonexistent')).toBeNull();
  });
});
