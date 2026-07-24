
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxFilters } from '../useInboxFilters';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mocking dependencies
const mockHasPermission = vi.hoisted(() => vi.fn());

vi.mock('@/features/auth', () => ({
  usePermissions: () => ({
    hasPermission: mockHasPermission,
    loading: false,
    permissions: [],
    userPermissions: [],
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  },
}));

vi.mock('@/hooks/useUrlFilters', () => ({
  useUrlFilters: () => {
    const [f, s] = React.useState<{
      status: string[];
      tags: string[];
      agentId: string | null;
      dateRange?: { from: Date | null; to: Date | null };
    }>({ status: [], tags: [], agentId: null });
    return {
      filters: f,
      setFilters: s,
      clearFilters: vi.fn(),
    };
  },
}));

vi.mock('@/features/inbox', () => ({
  useAllTicketStates: () => ({}),
  filterByContactType: (
    convs: Array<{ contact: { contact_type: string | null } }>,
    type: string | null | undefined
  ) => {
    if (!type) return convs;
    return convs.filter((c) => c.contact.contact_type === type);
  },
  useFailureMetricsBatch: () => ({ data: {} }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useInboxFilters Business Rules', () => {
  type MockConversation = {
    contact: { id: string; assigned_to: string | null; contact_type: string | null };
    messages: unknown[];
    unreadCount: number;
  };

  const mockConversations: MockConversation[] = [
    {
      contact: { id: 'c1', assigned_to: 'agent-1', contact_type: 'cliente' },
      messages: [],
      unreadCount: 0,
    },
    {
      contact: { id: 'c2', assigned_to: 'agent-2', contact_type: 'colaborador' },
      messages: [],
      unreadCount: 0,
    },
    {
      contact: { id: 'c3', assigned_to: null, contact_type: 'cliente' },
      messages: [],
      unreadCount: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('filters by department scope for coordinators', () => {
    mockHasPermission.mockImplementation((perm: string) => perm === 'inbox.view_department');

    const { result } = renderHook(
      () =>
        useInboxFilters({
          conversations: mockConversations as never,
          profileId: 'agent-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.setSubTab('attending');
      result.current.setScope('department');
      result.current.setDepartmentAgentIds(['agent-1', 'agent-2']);
    });

    const filtered = result.current.filteredConversations;

    expect(filtered.length).toBe(2);
    expect(filtered.map((f) => f.contact.id)).toContain('c1');
    expect(filtered.map((f) => f.contact.id)).toContain('c2');
  });

  it('filters by specific agent when selected by coordinator', () => {
    mockHasPermission.mockImplementation((perm: string) => perm === 'inbox.view_department');

    const { result } = renderHook(
      () =>
        useInboxFilters({
          conversations: mockConversations as never,
          profileId: 'agent-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.setSubTab('attending');
      result.current.setScope('department');
      result.current.setDepartmentAgentIds(['agent-1', 'agent-2']);

      result.current.setFilters({
        status: [],
        tags: [],
        agentId: 'agent-2',
        dateRange: { from: null, to: null },
      });
    });

    const filtered = result.current.filteredConversations;

    expect(filtered.length).toBe(1);
    expect(filtered[0].contact.id).toBe('c2');
  });

  it('shows only mine for common agents', () => {
    mockHasPermission.mockReturnValue(false);

    const { result } = renderHook(
      () =>
        useInboxFilters({
          conversations: mockConversations as never,
          profileId: 'agent-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.setSubTab('attending');
      result.current.setScope('mine');
    });

    const filtered = result.current.filteredConversations;

    expect(filtered.length).toBe(1);
    expect(filtered[0].contact.id).toBe('c1');
  });
});
