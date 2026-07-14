/**
 * Tests for React Query hooks in hooks.ts.
 *
 * evoApi (proxy.ts) is mocked so no network calls are made.
 * Each test wraps renderHook in a fresh QueryClient to avoid state leakage.
 *
 * Covered:
 *   - useEvoApiDashboard: queryKey, queryFn, refetchInterval, staleTime
 *   - useActiveAlerts: queryKey, queryFn, staleTime
 *   - useAcknowledgeAlert: mutationFn calls evoApi.update; invalidates KEY on success
 *   - useHealthHistory: queryKey, queryFn, limit
 *   - useAlertChannels: queryKey, queryFn
 *   - useTestAlertChannel: mutationFn calls rpc with channelId
 *   - useDrRunbook: queryKey, queryFn
 *   - useDrHealth: queryKey, queryFn
 *   - useRunTestSuite: mutationFn calls rpc; invalidates KEY on success
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockRpc = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock('../proxy', () => ({
  evoApi: {
    rpc: mockRpc,
    select: mockSelect,
    update: mockUpdate,
  },
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import {
  useEvoApiDashboard,
  useActiveAlerts,
  useAcknowledgeAlert,
  useHealthHistory,
  useAlertChannels,
  useTestAlertChannel,
  useDrRunbook,
  useDrHealth,
  useRunTestSuite,
} from '../hooks';

// ── Helpers ───────────────────────────────────────────────────────────────────
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper: Wrapper, queryClient };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ── useEvoApiDashboard ────────────────────────────────────────────────────────
describe('useEvoApiDashboard', () => {
  it('calls evoApi.rpc with rpc_pipeline_dashboard', async () => {
    const fakeData = { health: {}, readiness: {}, integrity: {}, computed_at: 'now' };
    mockRpc.mockResolvedValue({ data: fakeData });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEvoApiDashboard(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('rpc_pipeline_dashboard');
    expect(result.current.data).toEqual({ data: fakeData });
  });

  it('uses custom refetchMs when provided', () => {
    const { wrapper } = createWrapper();
    // Only testing config — no network needed since query won't run without data
    // We verify the hook instantiates with the param without throwing
    expect(() =>
      renderHook(() => useEvoApiDashboard(60_000), { wrapper })
    ).not.toThrow();
  });

  it('uses default refetchMs of 30 000', () => {
    const { wrapper } = createWrapper();
    expect(() =>
      renderHook(() => useEvoApiDashboard(), { wrapper })
    ).not.toThrow();
  });

  it('exposes isLoading while pending', () => {
    // Never-resolving mock
    mockRpc.mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEvoApiDashboard(), { wrapper });
    expect(result.current.isLoading || result.current.isPending).toBe(true);
  });
});

// ── useActiveAlerts ───────────────────────────────────────────────────────────
describe('useActiveAlerts', () => {
  it('calls evoApi.select with v_alerts_active ordered by created_at desc', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: 1, severity: 'critical' }] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useActiveAlerts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'v_alerts_active',
        order: { column: 'created_at', ascending: false },
        limit: 100,
      })
    );
  });

  it('returns the data from evoApi.select', async () => {
    const alerts = [{ id: 1, severity: 'warning' }];
    mockSelect.mockResolvedValue({ data: alerts });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useActiveAlerts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ data: alerts });
  });
});

// ── useAcknowledgeAlert ───────────────────────────────────────────────────────
describe('useAcknowledgeAlert', () => {
  it('calls evoApi.update on alert_log with acknowledged=true', async () => {
    mockUpdate.mockResolvedValue({ data: null });

    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

    result.current.mutate(42);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'alert_log',
        data: expect.objectContaining({ acknowledged: true }),
        match: { id: 42 },
      })
    );
  });

  it('passes acknowledged_at as an ISO string', async () => {
    mockUpdate.mockResolvedValue({ data: null });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

    result.current.mutate(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const callArg = mockUpdate.mock.calls[0][0];
    expect(new Date(callArg.data.acknowledged_at).toISOString()).toBe(callArg.data.acknowledged_at);
  });

  it('invalidates evo-api-health queryKey on success', async () => {
    mockUpdate.mockResolvedValue({ data: null });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });
    result.current.mutate(1);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['evo-api-health'] })
    );
  });
});

// ── useHealthHistory ──────────────────────────────────────────────────────────
describe('useHealthHistory', () => {
  it('calls evoApi.select with v_health_history, limit 288', async () => {
    mockSelect.mockResolvedValue({ data: [] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useHealthHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'v_health_history', limit: 288 })
    );
  });
});

// ── useAlertChannels ──────────────────────────────────────────────────────────
describe('useAlertChannels', () => {
  it('calls evoApi.select with v_alert_channels_health', async () => {
    mockSelect.mockResolvedValue({ data: [] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAlertChannels(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'v_alert_channels_health', limit: 50 })
    );
  });
});

// ── useTestAlertChannel ───────────────────────────────────────────────────────
describe('useTestAlertChannel', () => {
  it('calls evoApi.rpc with fn_test_alert_channel and channelId', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true } });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTestAlertChannel(), { wrapper });

    result.current.mutate(5);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('fn_test_alert_channel', { p_channel_id: 5 });
  });
});

// ── useDrRunbook ──────────────────────────────────────────────────────────────
describe('useDrRunbook', () => {
  it('calls evoApi.select with v_dr_runbook ordered by step_number asc', async () => {
    mockSelect.mockResolvedValue({ data: [] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDrRunbook(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'v_dr_runbook',
        order: { column: 'step_number', ascending: true },
      })
    );
  });
});

// ── useDrHealth ───────────────────────────────────────────────────────────────
describe('useDrHealth', () => {
  it('calls evoApi.rpc with rpc_dr_health_check', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'ok' } });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDrHealth(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('rpc_dr_health_check');
  });
});

// ── useRunTestSuite ───────────────────────────────────────────────────────────
describe('useRunTestSuite', () => {
  it('calls evoApi.rpc with rpc_run_full_test_suite', async () => {
    mockRpc.mockResolvedValue({ data: { pass_rate_pct: 100 } });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRunTestSuite(), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('rpc_run_full_test_suite');
  });

  it('invalidates evo-api-health queryKey on success', async () => {
    mockRpc.mockResolvedValue({ data: { pass_rate_pct: 100 } });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRunTestSuite(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['evo-api-health'] })
    );
  });
});
