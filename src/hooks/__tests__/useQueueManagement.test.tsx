// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn(() => ({ user: { id: 'u1' } })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import {
  useQueuesCrudManagement,
  useQueueAnalyticsManagement,
  useQueueGoalsManagement,
  useQueueSlaManagement,
  useQueuesComparisonManagement,
} from '@/hooks/useQueueManagement';

const dateRange = { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-07') };

describe('useQueueManagement — hooks consolidados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  });

  describe('useQueuesCrudManagement', () => {
    it('busca filas e expõe contrato tipado', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [{ id: 'q1', name: 'Suporte', status: 'active', created_at: '', updated_at: '' }],
            error: null,
          }),
        }),
      });

      const { result } = renderHook(() => useQueuesCrudManagement());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(Array.isArray(result.current.queues)).toBe(true);
      expect(result.current.queues[0]?.id).toBe('q1');
      expect(typeof result.current.refetch).toBe('function');
      expect(result.current.error).toBeNull();
    });

    it('define erro quando query falha', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: new Error('boom') }),
        }),
      });

      const { result } = renderHook(() => useQueuesCrudManagement());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe('boom');
      expect(result.current.queues).toEqual([]);
    });

    it('não busca sem usuário autenticado', async () => {
      mockUseAuth.mockReturnValue({ user: null });
      const { result } = renderHook(() => useQueuesCrudManagement());
      expect(result.current.loading).toBe(true);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('useQueueAnalyticsManagement', () => {
    it('retorna analytics ou null quando não há registros', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      });

      const { result } = renderHook(() =>
        useQueueAnalyticsManagement({ queueId: 'q1', dateRange })
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.analytics).toBeNull();
      expect(typeof result.current.refetch).toBe('function');
    });

    it('normaliza analytics quando query retorna dados', async () => {
      const payload = {
        queue_id: 'q1',
        total_messages: 42,
        average_response_time: 3.5,
        resolution_rate: 90,
        customer_satisfaction: 4.5,
        timestamp: '2024-01-05T00:00:00Z',
      };
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: payload, error: null }),
              }),
            }),
          }),
        }),
      });

      const { result } = renderHook(() =>
        useQueueAnalyticsManagement({ queueId: 'q1', dateRange })
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.analytics?.total_messages).toBe(42);
      expect(result.current.analytics?.resolution_rate).toBe(90);
    });
  });

  describe('useQueueGoalsManagement', () => {
    it('busca metas filtradas por queueId', async () => {
      const eq = vi.fn().mockResolvedValue({
        data: [{ id: 'g1', queue_id: 'q1', metric: 'response', target_value: 5 }],
        error: null,
      });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({ eq }),
      });

      const { result } = renderHook(() => useQueueGoalsManagement('q1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(eq).toHaveBeenCalledWith('queue_id', 'q1');
      expect(result.current.goals[0]?.id).toBe('g1');
      expect(typeof result.current.updateGoalStatus).toBe('function');
    });

    it('chama update quando updateGoalStatus é executado', async () => {
      const eqUpdate = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq: eqUpdate });
      const selectResult = { data: [], error: null };

      mockFrom.mockImplementation(() => ({
        select: vi.fn().mockResolvedValue(selectResult),
        update,
      }));

      const { result } = renderHook(() => useQueueGoalsManagement());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.updateGoalStatus('g1', 'on_track');
      });

      expect(update).toHaveBeenCalledWith({ status: 'on_track' });
      expect(eqUpdate).toHaveBeenCalledWith('id', 'g1');
    });
  });

  describe('useQueueSlaManagement', () => {
    const filters = { skill_name: null, channel_type: null, sla_status: null };

    it('normaliza linhas do RPC com defaults seguros', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            queue_id: 'q1',
            queue_name: 'Fila A',
            // demais campos ausentes para testar defaults
          },
        ],
        error: null,
      });

      const { result } = renderHook(() => useQueueSlaManagement({ filters }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockRpc).toHaveBeenCalledWith('rpc_queue_sla_panel', expect.objectContaining({
        p_skill_name: null,
        p_channel_type: null,
        p_sla_status: null,
      }));

      const row = result.current.rows[0];
      expect(row.queue_id).toBe('q1');
      expect(row.queue_name).toBe('Fila A');
      expect(row.sla_priority).toBe('medium');
      expect(row.sla_status).toBe('on_track');
      expect(row.routing_weight).toBe(1);
      expect(row.auto_rebalance_enabled).toBe(true);
      expect(row.color).toContain('hsl');
    });

    it('rows e slaRows apontam para o mesmo dataset', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      const { result } = renderHook(() => useQueueSlaManagement({ filters }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.rows).toBe(result.current.slaRows);
    });

    it('updateQueueConfig retorna false em erro', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'fail' } }),
        }),
      });

      const { result } = renderHook(() => useQueueSlaManagement({ filters }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let ok = true;
      await act(async () => {
        ok = await result.current.updateQueueConfig('q1', { sla_priority: 'high' });
      });
      expect(ok).toBe(false);
    });

    it('triggerRebalance chama RPC correta', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      const { result } = renderHook(() => useQueueSlaManagement({ filters }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.triggerRebalance(10);
      });

      expect(mockRpc).toHaveBeenCalledWith('rpc_queue_rebalance_candidates', { p_limit: 10 });
    });
  });

  describe('useQueuesComparisonManagement', () => {
    it('formata comparação com defaults quando queue_analytics vazio', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            { id: 'q1', name: 'A', queue_analytics: [] },
            {
              id: 'q2',
              name: 'B',
              queue_analytics: [
                { total_messages: 10, average_response_time: 2, resolution_rate: 80, customer_satisfaction: 4 },
              ],
            },
          ],
          error: null,
        }),
      });

      const { result } = renderHook(() => useQueuesComparisonManagement({ dateRange }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.comparison).toHaveLength(2);
      expect(result.current.comparison[0].metrics.messageCount).toBe(0);
      expect(result.current.comparison[1].metrics.messageCount).toBe(10);
      expect(result.current.comparison[1].metrics.satisfaction).toBe(4);
    });
  });
});
