import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockGetUser = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockToastInfo = vi.hoisted(() => vi.fn());
const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: { info: mockToastInfo },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => mockLog,
}));

import { useGoalNotifications } from '@/hooks/useGoalNotifications';

interface GoalRow {
  id: string;
  queue_id: string;
  alerts_enabled: boolean | null;
  max_waiting_contacts: number | null;
  max_avg_wait_minutes: number | null;
  min_assignment_rate: number | null;
  max_messages_pending: number | null;
}

interface MetricsRow {
  queue_id: string;
  waiting_contacts: number;
  avg_wait_minutes: number;
  assignment_rate: number | null;
  messages_pending: number | null;
  coverage: string;
}

const GOAL: GoalRow = {
  id: 'g1',
  queue_id: 'q1',
  alerts_enabled: true,
  max_waiting_contacts: 10,
  max_avg_wait_minutes: 30,
  min_assignment_rate: 80,
  max_messages_pending: 50,
};

function metricsRow(overrides: Partial<MetricsRow>): MetricsRow {
  return {
    queue_id: 'q1',
    waiting_contacts: 0,
    avg_wait_minutes: 0,
    assignment_rate: 90,
    messages_pending: 0,
    coverage: 'ok',
    ...overrides,
  };
}

function mockSelect(table: string, data: unknown) {
  return { select: vi.fn().mockResolvedValue({ data, error: null }) };
}

describe('useGoalNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'queue_goals') return mockSelect(table, [GOAL]);
      if (table === 'queues') return mockSelect(table, [{ id: 'q1', name: 'Suporte' }]);
      return mockSelect(table, []);
    });
    mockRpc.mockResolvedValue({ data: [metricsRow({})], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes checkGoalProgress function', () => {
    const { result } = renderHook(() => useGoalNotifications());
    expect(typeof result.current.checkGoalProgress).toBe('function');
  });

  it('does not check when no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not call the RPC when there are no goals configured', async () => {
    mockFrom.mockImplementation((table: string) => mockSelect(table, []));
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it('does not call the RPC when all goals have alerts disabled', async () => {
    mockFrom.mockImplementation((table: string) =>
      mockSelect(table, table === 'queue_goals' ? [{ ...GOAL, alerts_enabled: false }] : [])
    );
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it('fires a toast with the real value when a threshold band is crossed', async () => {
    mockRpc.mockResolvedValue({
      data: [metricsRow({ waiting_contacts: 12, assignment_rate: null })],
      error: null,
    });
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockRpc).toHaveBeenCalledWith('rpc_queue_goal_metrics');
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringContaining('Espera (contatos) 12/10 (120%)')
    );
  });

  it('does not fire when values are below the lowest band', async () => {
    mockRpc.mockResolvedValue({
      data: [metricsRow({ waiting_contacts: 4, messages_pending: 10 })],
      error: null,
    });
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it('skips checks without base data (NULL) instead of firing', async () => {
    // assignment_rate NULL (sem fluxo de atribuição) e messages_pending NULL
    // (fila sem mapeamento de contatos) → sem toast, com log.
    mockRpc.mockResolvedValue({
      data: [metricsRow({ assignment_rate: null, messages_pending: null, coverage: 'sem_atribuicao' })],
      error: null,
    });
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalled();
  });

  it('skips wait-minutes check when the queue has no positions (coverage=sem_posicoes)', async () => {
    mockRpc.mockResolvedValue({
      data: [metricsRow({ waiting_contacts: 0, avg_wait_minutes: 0, coverage: 'sem_posicoes' })],
      error: null,
    });
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it('fires a toast for inverted checks when the rate drops below a band', async () => {
    // min_assignment_rate=80: 55 <= 80*0.75=60 → cruzou o band 75.
    mockRpc.mockResolvedValue({
      data: [metricsRow({ assignment_rate: 55 })],
      error: null,
    });
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringContaining('Taxa de atribuição 55/80 (69%)')
    );
  });

  it('does not fire twice for the same band in the same session', async () => {
    mockRpc.mockResolvedValue({
      data: [metricsRow({ waiting_contacts: 12, assignment_rate: null })],
      error: null,
    });
    const { result } = renderHook(() => useGoalNotifications());
    await result.current.checkGoalProgress();
    await result.current.checkGoalProgress();
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
  });
});
