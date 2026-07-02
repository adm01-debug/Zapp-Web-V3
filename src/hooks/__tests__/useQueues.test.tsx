import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockQueues = [
  { id: 'q1', name: 'Suporte', color: '#blue', is_active: true, max_wait_time_minutes: 30, priority: 1, description: null, created_at: '', updated_at: '' },
  { id: 'q2', name: 'Vendas', color: '#green', is_active: true, max_wait_time_minutes: 15, priority: 2, description: null, created_at: '', updated_at: '' },
];

const mockMembers = [
  { id: 'm1', queue_id: 'q1', profile_id: 'p1', is_active: true, created_at: '', profile: { id: 'p1', name: 'Agent 1', avatar_url: null, is_active: true } },
];

const mockWaiting = [
  { queue_id: 'q1' },
  { queue_id: 'q1' },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'queues') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockQueues, error: null }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'q3', name: 'New' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'queue_members') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      // Waiting counts now come from queue_positions (via dbFrom -> lovable
      // client -> supabase.from). The old contacts.queue_id source was always
      // 0, so the hook was corrected; the mock follows the same source.
      if (table === 'queue_positions') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockWaiting, error: null }),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger');

import { useQueues } from '@/hooks/useQueues';

describe('useQueues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches queues with members and waiting counts', async () => {
    const { result } = renderHook(() => useQueues());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.queues).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('maps members to correct queues', async () => {
    const { result } = renderHook(() => useQueues());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const suporteQueue = result.current.queues.find(q => q.name === 'Suporte');
    expect(suporteQueue?.members).toHaveLength(1);
    expect(suporteQueue?.members[0].profile?.name).toBe('Agent 1');
  });

  it('calculates waiting counts per queue', async () => {
    const { result } = renderHook(() => useQueues());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const suporteQueue = result.current.queues.find(q => q.name === 'Suporte');
    expect(suporteQueue?.waiting_count).toBe(2);

    const vendasQueue = result.current.queues.find(q => q.name === 'Vendas');
    expect(vendasQueue?.waiting_count).toBe(0);
  });

  it('returns loading=true initially', () => {
    const { result } = renderHook(() => useQueues());
    expect(result.current.loading).toBe(true);
  });
});
