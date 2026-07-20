import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { evoApi } from './proxy';
import type {
  DashboardResponse, ActiveAlert, AlertChannel,
  HealthHistoryRow, DrRunbookStep, TestSuiteResult,
} from './types';

/** Polls the Evolution API health pipeline dashboard every 30 s (configurable). Returns live KPI and pipeline metrics. */
export function useEvoApiDashboard(refetchMs = 30_000) {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthDashboard(),
    queryFn: () => evoApi.rpc<DashboardResponse>('rpc_pipeline_dashboard'),
    refetchInterval: refetchMs,
    staleTime: 25_000,
    refetchOnWindowFocus: false,
  });
}

/** Polls active alert_log entries every 15 s (configurable), ordered by creation time descending, capped at 100 rows. */
export function useActiveAlerts(refetchMs = 15_000) {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthAlertsActive(),
    queryFn: () => evoApi.select<ActiveAlert>({
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

/** Mutation that marks an alert_log row as acknowledged and invalidates all evo-api-health queries. */
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

/** Queries up to 288 rows from v_health_history (24 h at 5-min intervals), refreshing every 60 s. */
export function useHealthHistory() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthHistory(),
    queryFn: () => evoApi.select<HealthHistoryRow>({
      table: 'v_health_history',
      select: '*',
      limit: 288,
    }),
    refetchInterval: 60_000,
    staleTime: 50_000,
    refetchOnWindowFocus: false,
  });
}

/** Queries v_alert_channels_health for up to 50 alert channel rows; cached for 2 minutes since channels rarely change. */
export function useAlertChannels() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthChannels(),
    queryFn: () => evoApi.select<AlertChannel>({
      table: 'v_alert_channels_health',
      select: '*',
      limit: 50,
    }),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
}

/** Mutation that triggers fn_test_alert_channel for a given channel ID, verifying the delivery pipeline end-to-end. */
export function useTestAlertChannel() {
  return useMutation({
    mutationFn: (channelId: number) =>
      evoApi.rpc('fn_test_alert_channel', { p_channel_id: channelId }),
  });
}

/** Queries v_dr_runbook steps in ascending step_number order; cached for 5 minutes since runbook content is static. */
export function useDrRunbook() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthDrRunbook(),
    queryFn: () => evoApi.select<DrRunbookStep>({
      table: 'v_dr_runbook',
      select: '*',
      order: { column: 'step_number', ascending: true },
      limit: 50,
    }),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
}

/** Polls rpc_dr_health_check every 60 s to surface disaster-recovery readiness metrics. */
export function useDrHealth() {
  return useQuery({
    queryKey: queryKeys.adminOps.evoApiHealthDrHealth(),
    queryFn: () => evoApi.rpc<Record<string, unknown>>('rpc_dr_health_check'),
    refetchInterval: 60_000,
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}

/** Mutation that executes the full Evolution API test suite via rpc_run_full_test_suite and invalidates health queries on success. */
export function useRunTestSuite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => evoApi.rpc<TestSuiteResult>('rpc_run_full_test_suite'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminOps.evoApiHealth() }),
  });
}
