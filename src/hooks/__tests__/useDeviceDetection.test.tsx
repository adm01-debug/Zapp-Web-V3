import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockFrom = vi.hoisted(() => vi.fn());
const mockFunctionsInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
}));

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/logger');

import { useDeviceDetection } from '@/hooks/useDeviceDetection';

describe('useDeviceDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFunctionsInvoke.mockResolvedValue({ data: { device_id: 'd1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
        neq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('initializes with loading=true', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('returns empty devices initially', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(result.current.devices).toEqual([]);
  });

  it('returns empty sessions initially', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(result.current.sessions).toEqual([]);
  });

  it('exposes trustDevice function', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(typeof result.current.trustDevice).toBe('function');
  });

  it('exposes removeDevice function', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(typeof result.current.removeDevice).toBe('function');
  });

  it('exposes endSession function', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(typeof result.current.endSession).toBe('function');
  });

  it('exposes endAllOtherSessions function', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(typeof result.current.endAllOtherSessions).toBe('function');
  });

  it('exposes refetch function', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(typeof result.current.refetch).toBe('function');
  });

  it('does not fetch when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(result.current.devices).toEqual([]);
  });

  it('fetches devices and sessions when user present', async () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('user_devices');
    expect(mockFrom).toHaveBeenCalledWith('user_sessions');
  });

  it('currentDeviceId starts as null', () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    expect(result.current.currentDeviceId).toBeNull();
  });
});
