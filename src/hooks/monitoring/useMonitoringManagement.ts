import { useState, useCallback } from 'react';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { supabase } from '@/integrations/supabase/client';
import { useMountedRef } from '@/hooks/useMountedRef';
import { toast } from 'sonner';
import type {
  ConnectionInfo,
  HealthLog,
  MessageStats,
  UptimeInfo,
  SparklineData,
  InstanceUptime,
  TimePeriod,
  WebhookTestResult,
  WebhookConfig,
  DiagnosticResult,
} from '@/components/monitoring/hooks/types';
import { periodMs, periodBuckets } from '@/components/monitoring/hooks/types';
import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';
import { isUuidLike } from '@/lib/evolutionInstance';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

/** Hook: Use Monitoring Data Params. */
export interface UseMonitoringDataParams {
  onConnectionsUpdate?: (conns: ConnectionInfo[]) => void;
}

/** Hook: Use Monitoring Data Result. */
export interface UseMonitoringDataResult {
  connections: ConnectionInfo[];
  healthLogs: HealthLog[];
  loading: boolean;
  messageStats: MessageStats;
  uptime: UptimeInfo;
  sparklines: SparklineData;
  instanceUptimes: InstanceUptime[];
  fetchData: (period: TimePeriod) => Promise<void>;
}

/** Hook: Use Monitoring Actions Params. */
export interface UseMonitoringActionsParams {
  fetchData: () => Promise<void>;
}

/** Hook: Use Monitoring Actions Result. */
export interface UseMonitoringActionsResult {
  refreshing: boolean;
  webhookTest: WebhookTestResult;
  webhookConfig: WebhookConfig | null;
  reconfiguring: boolean;
  diagnostic: DiagnosticResult | null;
  diagnosing: boolean;
  runHealthCheck: () => Promise<void>;
  testWebhookDelivery: (instanceId: string) => Promise<void>;
  checkWebhookConfig: (instanceId: string) => Promise<void>;
  reconfigureWebhook: (instanceId: string) => Promise<void>;
  runDiagnostic: (autoFix?: boolean) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

const log = getLogger('useMonitoringManagement');
const HEALTHY_STATUSES = ['connected', 'healthy'];

/** Computes overall uptime statistics for the last 24 hours from the provided health logs relative to `now`. */
function computeUptime(logs: HealthLog[], now: Date): UptimeInfo {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = logs.filter((l) => new Date(l.checked_at) >= dayAgo);
  const healthy = recent.filter((l) => HEALTHY_STATUSES.includes(l.status));
  const lastFail = recent.find((l) => !HEALTHY_STATUSES.includes(l.status));
  return {
    percentage: recent.length > 0 ? Math.round((healthy.length / recent.length) * 1000) / 10 : 100,
    totalChecks: recent.length,
    healthyChecks: healthy.length,
    lastDowntime: lastFail?.checked_at || null,
  };
}

/** Groups health logs by instance and computes per-instance uptime percentage, check counts, average latency, and last error for the 24-hour window ending at `now`. */
function computeInstanceUptimes(logs: HealthLog[], now: Date): InstanceUptime[] {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = logs.filter((l) => new Date(l.checked_at) >= dayAgo);
  const map = new Map<string, HealthLog[]>();
  recent.forEach((l) => {
    map.set(l.instance_id, [...(map.get(l.instance_id) || []), l]);
  });

  return Array.from(map.entries()).map(([instanceId, instLogs]) => {
    const h = instLogs.filter((l) => HEALTHY_STATUSES.includes(l.status));
    const latencies = instLogs
      .filter((l) => l.response_time_ms != null)
      .map((l) => l.response_time_ms!);
    const lastErr = instLogs.find((l) => !HEALTHY_STATUSES.includes(l.status));
    return {
      instanceId,
      percentage: instLogs.length > 0 ? Math.round((h.length / instLogs.length) * 1000) / 10 : 100,
      totalChecks: instLogs.length,
      healthyChecks: h.length,
      avgLatency:
        latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : 0,
      lastError: lastErr?.error_message || null,
    };
  });
}

/** Builds 8-hour sparkline arrays (messages-per-hour, avg-latency-per-hour, uptime-pct-per-hour) for the 8-hour window ending at `now`. */
function computeSparklines(
  logs: HealthLog[],
  messages: { sender: string; created_at: string }[],
  now: Date
): SparklineData {
  const result: SparklineData = { messages: [], latency: [], uptime: [] };
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now.getTime() - (i + 1) * 3600000);
    const end = new Date(now.getTime() - i * 3600000);

    const hourLogs = logs.filter((l) => {
      const t = new Date(l.checked_at);
      return t >= start && t < end;
    });
    const hourHealthy = hourLogs.filter((l) => HEALTHY_STATUSES.includes(l.status));
    result.uptime.push(
      hourLogs.length > 0 ? Math.round((hourHealthy.length / hourLogs.length) * 100) : 100
    );

    const latLogs = hourLogs.filter((l) => l.response_time_ms != null);
    result.latency.push(
      latLogs.length > 0
        ? Math.round(latLogs.reduce((s, l) => s + (l.response_time_ms || 0), 0) / latLogs.length)
        : 0
    );

    result.messages.push(
      messages.filter((m) => {
        const t = new Date(m.created_at);
        return t >= start && t < end;
      }).length
    );
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// Monitoring Data Management (useMonitoringData consolidation)
// ═══════════════════════════════════════════════════════════

/** Hook: use Monitoring Data Management. */
export function useMonitoringDataManagement(
  params: UseMonitoringDataParams = {}
): UseMonitoringDataResult {
  const { onConnectionsUpdate } = params;
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageStats, setMessageStats] = useState<MessageStats>({
    incoming: 0,
    outgoing: 0,
    total: 0,
    hourlyData: [],
  });
  const [uptime, setUptime] = useState<UptimeInfo>({
    percentage: 0,
    totalChecks: 0,
    healthyChecks: 0,
    lastDowntime: null,
  });
  const [sparklines, setSparklines] = useState<SparklineData>({
    messages: [],
    latency: [],
    uptime: [],
  });
  const [instanceUptimes, setInstanceUptimes] = useState<InstanceUptime[]>([]);
  const mountedRef = useMountedRef();

  const fetchData = useCallback(
    async (period: TimePeriod = '12h') => {
      try {
        const now = new Date();
        const since = new Date(now.getTime() - periodMs[period]);

        const [connRes, logsRes, msgRes] = await Promise.all([
          safeFrom('whatsapp_connections').select(
            'id, instance_id, instance_name, phone_number, status, health_status, health_response_ms, last_health_check, updated_at'
          ),
          safeFrom('connection_health_logs')
            .select('*')
            .order('checked_at', { ascending: false })
            .limit(500),
          dbFrom('messages')
            .select('sender, created_at')
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: true }),
        ]);

        if (!mountedRef.current) return;

        if (connRes.data) {
          setConnections(connRes.data);
          onConnectionsUpdate?.(connRes.data);
        }

        if (logsRes.data) {
          setHealthLogs(logsRes.data);
          setUptime(computeUptime(logsRes.data, now));
          setInstanceUptimes(computeInstanceUptimes(logsRes.data, now));
        }

        if (msgRes.data) {
          const incoming = msgRes.data.filter((m) => m.sender === 'contact').length;
          const outgoing = msgRes.data.filter((m) => m.sender === 'agent').length;

          const bucketCount = periodBuckets[period];
          const bucketSize = periodMs[period] / bucketCount;
          const buckets: Record<string, { incoming: number; outgoing: number }> = {};

          for (let i = bucketCount - 1; i >= 0; i--) {
            const bTime = new Date(now.getTime() - i * bucketSize);
            const key =
              period === '7d'
                ? `${bTime.getDate().toString().padStart(2, '0')}/${(bTime.getMonth() + 1).toString().padStart(2, '0')}`
                : `${bTime.getHours().toString().padStart(2, '0')}:00`;
            buckets[key] = { incoming: 0, outgoing: 0 };
          }

          msgRes.data.forEach((m) => {
            const mTime = new Date(m.created_at);
            const key =
              period === '7d'
                ? `${mTime.getDate().toString().padStart(2, '0')}/${(mTime.getMonth() + 1).toString().padStart(2, '0')}`
                : `${mTime.getHours().toString().padStart(2, '0')}:00`;
            if (buckets[key]) {
              if (m.sender === 'contact') buckets[key].incoming++;
              else buckets[key].outgoing++;
            }
          });

          setMessageStats({
            incoming,
            outgoing,
            total: msgRes.data.length,
            hourlyData: Object.entries(buckets).map(([hour, d]) => ({ hour, ...d })),
          });
        }

        // Sparklines
        if (logsRes.data && msgRes.data) {
          setSparklines(computeSparklines(logsRes.data, msgRes.data, now));
        }
      } catch (err) {
        log.error('Monitoring data fetch error', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [onConnectionsUpdate]
  );

  return {
    connections,
    healthLogs,
    loading,
    messageStats,
    uptime,
    sparklines,
    instanceUptimes,
    fetchData,
  };
}

// ═══════════════════════════════════════════════════════════
// Monitoring Actions Management (useMonitoringActions consolidation)
// ═══════════════════════════════════════════════════════════

/** Hook: use Monitoring Actions Management. */
export function useMonitoringActionsManagement(
  params: UseMonitoringActionsParams
): UseMonitoringActionsResult {
  const { fetchData } = params;
  const [refreshing, setRefreshing] = useState(false);
  const [webhookTest, setWebhookTest] = useState<WebhookTestResult>({ status: 'idle' });
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig | null>(null);
  const [reconfiguring, setReconfiguring] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const runHealthCheck = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('connection-health-check', {
        method: 'POST',
        body: {},
      });
      if (error) throw error;
      toast.success(`Health check: ${data?.connections?.length || 0} conexões verificadas`);
      await fetchData();
    } catch {
      toast.error('Erro ao executar health check');
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  const testWebhookDelivery = useCallback(async (instanceId: string) => {
    setWebhookTest({ status: 'testing' });
    const testId = `MONITOR_TEST_${Date.now()}`;
    const start = performance.now();
    try {
      const { error: invokeErr } = await supabase.functions.invoke('evolution-webhook', {
        method: 'POST',
        body: {
          event: 'messages.upsert',
          instance: instanceId,
          data: {
            key: { remoteJid: '5500000000000@s.whatsapp.net', fromMe: false, id: testId },
            pushName: '🔧 Monitor Test',
            messageTimestamp: Math.floor(Date.now() / 1000),
            message: { conversation: `[TESTE MONITOR] ${new Date().toLocaleString('pt-BR')}` },
          },
        },
      });
      const latency = Math.round(performance.now() - start);
      if (invokeErr) throw invokeErr;
      await new Promise((r) => setTimeout(r, 1000));
      const { data: msg } = await supabase
        .from('messages')
        .select('id')
        .eq('external_id', testId)
        .maybeSingle();
      if (msg) await supabase.from('messages').delete().eq('id', msg.id);
      setWebhookTest({
        status: msg ? 'success' : 'error',
        message: msg
          ? `Webhook processou e persistiu em ${latency}ms`
          : 'Webhook respondeu OK mas mensagem não foi persistida',
        latencyMs: latency,
      });
    } catch (err) {
      setWebhookTest({
        status: 'error',
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }, []);

  const checkWebhookConfig = useCallback(async (instanceId: string) => {
    if (isUuidLike(instanceId)) {
      toast.error('Nome de instância inválido (UUID detectado).');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api/get-webhook', {
        method: 'POST',
        body: { instanceName: instanceId },
      });
      if (error) throw error;
      const webhook = data?.webhook || data;
      setWebhookConfig({
        url: webhook?.url || webhook?.webhookUrl,
        events: webhook?.events || [],
        configured: !!(webhook?.url || webhook?.webhookUrl),
      });
    } catch {
      setWebhookConfig({ configured: false });
      toast.error('Erro ao verificar webhook');
    }
  }, []);

  const reconfigureWebhook = useCallback(
    async (instanceId: string) => {
      if (isUuidLike(instanceId)) {
        toast.error('Nome de instância inválido (UUID detectado).');
        return;
      }
      setReconfiguring(true);
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
        const { error } = await supabase.functions.invoke('evolution-api/set-webhook', {
          method: 'POST',
          body: {
            instanceName: instanceId,
            webhook: {
              url: webhookUrl,
              webhookByEvents: false,
              webhookBase64: true,
              events: [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'MESSAGES_DELETE',
                'MESSAGES_SET',
                'SEND_MESSAGE',
                'CONTACTS_UPSERT',
                'CONTACTS_UPDATE',
                'CONTACTS_SET',
                'PRESENCE_UPDATE',
                'CHATS_UPSERT',
                'CHATS_UPDATE',
                'CHATS_DELETE',
                'CHATS_SET',
                'CONNECTION_UPDATE',
                'LABELS_EDIT',
                'LABELS_ASSOCIATION',
                'GROUPS_UPSERT',
                'GROUP_PARTICIPANTS_UPDATE',
                'CALL',
                'QRCODE_UPDATED',
              ],
            },
          },
        });
        if (error) throw error;
        toast.success('Webhook reconfigurado com sucesso!');
        await checkWebhookConfig(instanceId);
      } catch (err) {
        toast.error(
          'Erro ao reconfigurar: ' + (err instanceof Error ? err.message : 'desconhecido')
        );
      } finally {
        setReconfiguring(false);
      }
    },
    [checkWebhookConfig]
  );

  const runDiagnostic = useCallback(
    async (autoFix = false) => {
      setDiagnosing(true);
      try {
        const { data, error } = await supabase.functions.invoke('webhook-diagnostic', {
          method: 'POST',
          body: { action: autoFix ? 'auto-fix' : 'full-diagnostic' },
        });
        if (error) throw error;
        setDiagnostic(data as DiagnosticResult); // ignore-audit: narrows Supabase query result to local interface
        if (autoFix) {
          toast.success('Diagnóstico + auto-fix concluído!');
          await fetchData();
        } else {
          toast.success('Diagnóstico concluído!');
        }
      } catch {
        toast.error('Erro no diagnóstico');
      } finally {
        setDiagnosing(false);
      }
    },
    [fetchData]
  );

  return {
    refreshing,
    webhookTest,
    webhookConfig,
    reconfiguring,
    diagnostic,
    diagnosing,
    runHealthCheck,
    testWebhookDelivery,
    checkWebhookConfig,
    reconfigureWebhook,
    runDiagnostic,
  };
}
