import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEmail } from './useEmail';
import { safeClient } from '@/integrations/supabase/safeClient';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    functions: {
      invoke: vi.fn(),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

describe('useEmail - Labels and RPC Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safeClient.rpc).mockResolvedValue({ data: null, error: null });
  });

  describe('markAsRead', () => {
    it('should call rpc_email_mark_thread_read', async () => {
      const { result } = renderHook(() => useEmail());

      await act(async () => {
        await result.current.markAsRead('t1', true);
      });

      expect(safeClient.rpc).toHaveBeenCalledWith(
        'rpc_email_mark_thread_read',
        expect.objectContaining({
          p_thread_id: 't1',
          p_read: true,
        })
      );
    });
  });

  describe('starThread', () => {
    it('should call rpc_email_star_thread', async () => {
      const { result } = renderHook(() => useEmail());

      await act(async () => {
        await result.current.starThread('t1', true);
      });

      expect(safeClient.rpc).toHaveBeenCalledWith('rpc_email_star_thread', {
        p_thread_id: 't1',
        p_starred: true,
      });
    });
  });

  describe('archiveThread', () => {
    it('should call rpc_email_archive_thread', async () => {
      const { result } = renderHook(() => useEmail());

      await act(async () => {
        await result.current.archiveThread('t1');
      });

      expect(safeClient.rpc).toHaveBeenCalledWith('rpc_email_archive_thread', {
        p_thread_id: 't1',
        p_archived: true,
      });
    });
  });

  describe('assignThread', () => {
    it('should call rpc_email_assign_thread', async () => {
      const { result } = renderHook(() => useEmail());

      await act(async () => {
        await result.current.assignThread('t1', 'agent_456');
      });

      expect(safeClient.rpc).toHaveBeenCalledWith('rpc_email_assign_thread', {
        p_thread_id: 't1',
        p_agent_id: 'agent_456',
      });
    });

    it('should handle RPC errors', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useEmail());

      // Persistente (não Once): chamadas de inicialização não devem "consumir"
      // o mock antes do assignThread sob teste.
      vi.mocked(safeClient.rpc).mockResolvedValue({
        data: null,
        error: { message: 'RPC Error' },
        requestId: 'req_123',
      } as unknown as Awaited<ReturnType<typeof safeClient.rpc>>);

      await act(async () => {
        await result.current.assignThread('t1', 'agent_456');
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email thread assign error'),
        'RPC Error'
      );
      consoleSpy.mockRestore();
    });
  });
});
