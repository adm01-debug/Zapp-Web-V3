import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

// Mock useAuth to return controlled user
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

import { useUserRole } from '@/features/auth/hooks/useUserRole';

describe('useUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty roles when no user is logged in', async () => {
    // roles agora vêm de useAuth().roles (refatoração de auth).
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      profile: null,
      roles: [],
      loading: false,
    });

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isSupervisor).toBe(false);
  });

  it('fetches and returns user roles correctly', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: {},
      profile: null,
      roles: ['admin', 'supervisor'],
      loading: false,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: '1', user_id: 'user-1', role: 'admin' },
            { id: '2', user_id: 'user-1', role: 'supervisor' },
          ],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.roles).toContain('admin');
    expect(result.current.roles).toContain('supervisor');
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isSupervisor).toBe(true);
  });

  it('hasRole returns correct values', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: {},
      profile: null,
      roles: ['agent'],
      loading: false,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: '1', user_id: 'user-1', role: 'agent' }],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasRole('agent')).toBe(true);
    expect(result.current.hasRole('admin')).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isSupervisor).toBe(false);
  });

  it('supervisor role implies isSupervisor=true but not isAdmin', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: {},
      profile: null,
      roles: ['supervisor'],
      loading: false,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: '1', user_id: 'user-1', role: 'supervisor' }],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSupervisor).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });
});
