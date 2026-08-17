import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

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

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: mockToast,
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/logger');

import { useScheduledMessages } from '@/hooks/useScheduledMessages';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockMessages = [
  {
    id: 'sm1',
    contact_id: 'c1',
    content: 'Follow up',
    scheduled_at: '2024-12-01T10:00:00Z',
    status: 'pending',
    created_at: '2024-01-01',
    message_type: 'text',
  },
  {
    id: 'sm2',
    contact_id: 'c2',
    content: 'Reminder',
    scheduled_at: '2024-12-02T10:00:00Z',
    status: 'sent',
    created_at: '2024-01-01',
    message_type: 'text',
  },
];

/** Mock do fetch de lista seguindo a ordem real do hook:
 *  from().select().order() → (contactId ? .eq() : await direto). */
function mockFetchList(listResult: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(listResult);
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue(Object.assign(Promise.resolve(listResult), { eq })),
    }),
  });
  return { eq };
}

/** Mock de agendamento (profiles lookup + insert com maybeSingle). */
function mockScheduleFlow(insertResult: { data: unknown; error: unknown }) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'scheduled_messages') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(insertResult),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    return {};
  });
}

const futureDate = () => new Date(Date.now() + 86_400_000);
const rlsError = { code: '42501', message: 'new row violates row-level security policy' };
// UUID válido — o hook só busca com contactId se for UUID real (isValidUUID).
const VALID_CONTACT = '11111111-1111-1111-1111-111111111111';

describe('useScheduledMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  });

  it('fetches scheduled messages', async () => {
    mockFetchList({ data: mockMessages, error: null });

    const { result } = renderHook(() => useScheduledMessages(VALID_CONTACT), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toBeDefined();
    expect(result.current.messages).toHaveLength(2);
  });

  it('handles fetch error', async () => {
    mockFetchList({ data: null, error: new Error('Network error') });

    const { result } = renderHook(() => useScheduledMessages(VALID_CONTACT), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isError).toBe(true);
  });

  it('fetches all scheduled messages without contactId (calendar view)', async () => {
    mockFetchList({ data: mockMessages, error: null });

    const { result } = renderHook(() => useScheduledMessages(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(mockMessages.length);
  });

  // ── CAMPANHAS-09: toast REAL em 403 (RLS), sem silêncio ──────────────────

  it('toasts real RLS error when schedule insert is denied (403/42501)', async () => {
    mockFetchList({ data: mockMessages, error: null });
    mockScheduleFlow({ data: null, error: rlsError });

    const { result } = renderHook(() => useScheduledMessages(VALID_CONTACT), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(
        result.current.scheduleMessage({
          contactId: VALID_CONTACT,
          content: 'Oi',
          scheduledAt: futureDate(),
        })
      ).rejects.toThrow();
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao agendar mensagem',
        variant: 'destructive',
        description: expect.stringContaining('Acesso negado'),
      })
    );
  });

  it('toasts real RLS error when cancel update is denied (403/42501)', async () => {
    mockFetchList({ data: mockMessages, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'scheduled_messages') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: rlsError }),
          }),
        };
      }
      return {};
    });

    const { result } = renderHook(() => useScheduledMessages(VALID_CONTACT), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.cancelMessage('sm1')).rejects.toThrow();
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao cancelar',
        variant: 'destructive',
        description: expect.stringContaining('Acesso negado'),
      })
    );
  });

  it('surfaces list RLS 403 with a real toast (calendar not silently empty)', async () => {
    mockFetchList({ data: null, error: rlsError });

    renderHook(() => useScheduledMessages(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Não foi possível carregar os agendamentos',
          variant: 'destructive',
        })
      );
    });
  });

  it('shows success toast when scheduling works', async () => {
    mockFetchList({ data: mockMessages, error: null });
    mockScheduleFlow({ data: { id: 'sm3', status: 'pending' }, error: null });

    const { result } = renderHook(() => useScheduledMessages(VALID_CONTACT), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.scheduleMessage({
        contactId: VALID_CONTACT,
        content: 'Oi',
        scheduledAt: futureDate(),
      });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensagem agendada com sucesso!' })
    );
  });
});
