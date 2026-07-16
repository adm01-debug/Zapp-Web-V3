import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { evoApi } from './proxy';
import type {
  DashboardResponse,
  ActiveAlert,
  AlertChannel,
  HealthHistoryRow,
  DrRunbookStep,
  TestSuiteResult,
} from './types';

export function useEvoApiDashboard(refetchMs = 30_000) {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthDashboard(),
    queryFn: () => evoApi.rpc<DashboardResponse>('rpc_pipeline_dashboard'),
    refetchInterval: refetchMs,
    staleTime: 25_000,
    refetchOnWindowFocus: false,
  });
}

export function useActiveAlerts(refetchMs = 15_000) {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthAlertsActive(),
    queryFn: () =>
      evoApi.select<ActiveAlert>({
        table: 'v_alerts_active',
        select: '*',
        order: { column: 'created_at', ascending: false },
        limit: 100,
      }),
    refetchInterval: refetchMs,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: number) => {
      await evoApi.update({
        table: 'alert_log',
        data: { acknowledged: true, acknowledged_at: new Date().toISOString() },
        match: { id: alertId },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminOps.evoApiHealth() }),
  });
}

export function useHealthHistory() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthHistory(),
    queryFn: () =>
      evoApi.select<HealthHistoryRow>({
        table: 'v_health_history',
        select: '*',
        limit: 288,
      }),
    refetchInterval: 60_000,
    staleTime: 50_000,
    refetchOnWindowFocus: false,
  });
}

export function useAlertChannels() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthChannels(),
    queryFn: () =>
      evoApi.select<AlertChannel>({
        table: 'v_alert_channels_health',
        select: '*',
        limit: 50,
      }),
    staleTime: 120_000, // Channels don't change often
    refetchOnWindowFocus: false,
  });
}

export function useTestAlertChannel() {
  return useMutation({
    mutationFn: (channelId: number) =>
      evoApi.rpc('fn_test_alert_channel', { p_channel_id: channelId }),
  });
}

export function useDrRunbook() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthDrRunbook(),
    queryFn: () =>
      evoApi.select<DrRunbookStep>({
        table: 'v_dr_runbook',
        select: '*',
        order: { column: 'step_number', ascending: true },
        limit: 50,
      }),
    staleTime: 300_000, // Static documentation
    refetchOnWindowFocus: false,
  });
}

export function useDrHealth() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthDrHealth(),
    queryFn: () => evoApi.rpc<Record<string, unknown>>('rpc_dr_health_check'),
    refetchInterval: 60_000,
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}

export function useRunTestSuite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => evoApi.rpc<TestSuiteResult>('rpc_run_full_test_suite'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminOps.evoApiHealth() }),
  });
}
