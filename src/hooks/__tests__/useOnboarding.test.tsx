import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/logger');

import { useOnboarding } from '@/hooks/useOnboarding';

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns loading=false when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('checks localStorage first for completed onboarding', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    localStorage.setItem('onboarding_completed_u1', 'true');

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('checks database when localStorage is empty', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: { onboarding_completed: true }, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('returns false when user has no settings', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('defaults to completed on database error', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      }),
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('exposes completeOnboarding function', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.completeOnboarding).toBe('function');
  });
});
