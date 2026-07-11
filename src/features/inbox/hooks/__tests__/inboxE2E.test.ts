import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxFilters } from '../useInboxFilters';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ConversationWithMessages } from '@/features/inbox';

const mockHasPermission = vi.fn();
const mockProfile = { id: 'coord-1', department: 'Sales' };

vi.mock('@/features/auth', () => ({
  usePermissions: () => ({
    hasPermission: mockHasPermission,
    loading: false,
  }),
  useAuth: () => ({
    profile: mockProfile,
    user: { id: 'user-1' },
  }),
  useUserRole: () => ({
    isSupervisor: true,
    roles: ['coordinator'],
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

let internalFilters = { status: [], tags: [], agentId: null, search: '' };
vi.mock('@/hooks/useUrlFilters', () => {
  return {
    useUrlFilters: () => ({
      filters: internalFilters,
      setFilters: (nf: Record<string, unknown>) => {
        internalFilters = { ...internalFilters, ...(nf as Partial<typeof internalFilters>) };
      },
      clearFilters: () => {
        internalFilters = { status: [], tags: [], agentId: null, search: '' };
      },
    }),
  };
});

vi.mock('@/features/inbox', () => ({
  useAllTicketStates: () => ({}),
  filterByContactType: (
    convs: { contact: { contact_type: string | null } }[],
    type: string | null
  ) => {
    if (!type) return convs;
    if (type === 'outros')
      return convs.filter(
        (c) =>
          !['cliente', 'colaborador', 'fornecedor', 'transportadora'].includes(
            c.contact.contact_type ?? ''
          )
      );
    return convs.filter((c) => c.contact.contact_type === type);
  },
  useFailureMetricsBatch: () => ({ data: {} }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Inbox Extensive E2E Logic Simulation', () => {
  const mockConversations = Array.from({ length: 100 }, (_, i) => ({
    contact: {
      id: `c${i}`,
      assigned_to: i < 30 ? 'agent-1' : i < 60 ? 'agent-2' : null,
      contact_type: i % 5 === 0 ? 'cliente' : i % 5 === 1 ? 'colaborador' : 'outros',
    },
    messages: [],
    unreadCount: i % 10 === 0 ? 1 : 0,
  })) as unknown as ConversationWithMessages[];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    internalFilters = { status: [], tags: [], agentId: null, search: '' };
  });

  it('Scenario: Coordinator audits a specific agent with unread messages', () => {
    mockHasPermission.mockImplementation((perm) =>
      [
        'inbox.view_department',
        'inbox.view_whatsapp',
        'inbox.view_instagram',
        'inbox.view_chat',
      ].includes(perm)
    );

    const { result } = renderHook(
      () =>
        useInboxFilters({
          conversations: mockConversations,
          profileId: 'coord-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.setScope('department');
      result.current.setDepartmentAgentIds(['agent-1', 'agent-2']);
      result.current.setFilters({
        status: ['unread'],
        tags: [],
        agentId: 'agent-1',
        dateRange: { from: null, to: null },
      });
    });

    const filtered = result.current.filteredConversations;

    expect(filtered.length).toBe(3);
    expect(filtered.every((f) => f.contact.assigned_to === 'agent-1')).toBe(true);
    expect(filtered.every((f) => f.unreadCount > 0)).toBe(true);
  });

  it('Scenario: Agent tries to switch to department scope (Security Check)', () => {
    mockHasPermission.mockImplementation((perm) =>
      ['inbox.view_whatsapp', 'inbox.view_instagram', 'inbox.view_chat'].includes(perm)
    );

    const { result } = renderHook(
      () =>
        useInboxFilters({
          conversations: mockConversations,
          profileId: 'agent-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.setScope('department');
    });

    // The security useEffect should revert it to 'mine' since mockHasPermission returns false for inbox.view_department
    expect(result.current.scope).toBe('mine');
    const filtered = result.current.filteredConversations;
    expect(filtered.every((f) => f.contact.assigned_to === 'agent-1')).toBe(true);
  });

  it('Scenario: Failure - Empty department returns zero conversations', () => {
    mockHasPermission.mockImplementation((perm) =>
      [
        'inbox.view_department',
        'inbox.view_whatsapp',
        'inbox.view_instagram',
        'inbox.view_chat',
      ].includes(perm)
    );

    const { result } = renderHook(
      () =>
        useInboxFilters({
          conversations: mockConversations,
          profileId: 'coord-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.setScope('department');
      result.current.setShowAll(false);
      result.current.setDepartmentAgentIds([]);
    });

    expect(result.current.filteredConversations.length).toBe(0);
  });

  it('Scenario: Stress test - 500 conversations with random assignments and status', () => {
    const agents = ['a1', 'a2', 'a3', 'a4', 'a5'];
    const largeMock = Array.from({ length: 500 }, (_, i) => ({
      contact: {
        id: `large-${i}`,
        assigned_to: i % 10 === 0 ? null : agents[i % 5],
        contact_type: ['cliente', 'colaborador', 'fornecedor', 'transportadora', 'outros'][i % 5],
        channel_type: 'whatsapp',
      },
      messages: [],
      unreadCount: i % 7 === 0 ? 1 : 0,
    })) as unknown as ConversationWithMessages[];

    mockHasPermission.mockReturnValue(true);

    const { result } = renderHook(
      () =>
        useInboxFilters({
          conversations: largeMock,
          profileId: 'a1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.setScope('all');
      result.current.setShowAll(true);
      result.current.setFilters({
        status: ['unread'],
        tags: [],
        agentId: 'a1',
        dateRange: { from: null, to: null },
      });
    });

    const filtered = result.current.filteredConversations;
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((f) => f.contact.assigned_to === 'a1' && f.unreadCount > 0)).toBe(true);
  });
});
