import { listInstances } from '@/lib/whatsappAdapter';
/**
 * useBridgeStatus — data layer for AdminBridgeStatusPage.
 * Centralises health checks, incidents, diagnostics, auto-refresh and
 * realtime subscriptions so the page component can focus on rendering.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { whatsapp } from '@/lib/whatsappAdapter';
import { useToast } from '@/hooks/use-toast';
import { runEvolutionDiagnostics, type DiagnosticResult } from '@/lib/evolutionDiagnostics';

const log = getLogger('AdminBridgeStatusPage');

/** Bridge Status type alias. */
export type BridgeStatus = 'online' | 'degraded' | 'offline' | 'loading';

/** System Incident interface definition. */
export interface SystemIncident {
  id: string;
  title: string;
  description: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
}

/** Active Alert interface definition. */
export interface ActiveAlert {
  id: string;
  title: string;
  alert_type: string;
}

const REFRESH_INTERVAL = 60;

/** use Bridge Status function. */
export function useBridgeStatus() {
  const { toast } = useToast();
  const mountedRef = useMountedRef();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<BridgeStatus>('loading');
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [lovableDb, setLovableDb] = useState<boolean | null>(null);
  const [externalDb, setExternalDb] = useState<boolean | null>(null);
  const [whatsappTransport, setWhatsappTransport] = useState<string>('...');
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  // Real instance count from Evolution API (via proxy). null = not measured yet/unavailable.
  const [instanceCount, setInstanceCount] = useState<number | null>(null);
  // Real round-trip latency of the health check (ms). null = unavailable.
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  // Real 24h uptime percentage from v_connection_uptime. null = unavailable.
  const [uptimePct, setUptimePct] = useState<number | null>(null);
  const [recentTraffic, setRecentTraffic] = useState<{ count: number; last_at: string | null }>({
    count: 0,
    last_at: null,
  });
  const [diagResults, setDiagResults] = useState<DiagnosticResult[] | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_INTERVAL);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Dedupe: nunca roda 2 health checks concorrentes (interval tick + trigger
  // realtime podem colidir no mesmo instante).
  const healthCheckInFlightRef = useRef(false);
  // Intervalo mínimo de 60s entre checks (inclui re-check por visibility).
  const lastHealthCheckAtRef = useRef(0);

  const runDiagnostics = useCallback(async () => {
    setDiagRunning(true);
    try {
      const results = await runEvolutionDiagnostics();
      if (!mountedRef.current) return;
      setDiagResults(results);
      toast({
        title: 'Diagnóstico Concluído',
        description: `Finalizado com ${results.filter((r) => r.status === 'fail').length} falhas.`,
      });
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      toast({
        title: 'Erro no Diagnóstico',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current) setDiagRunning(false);
    }
  }, [mountedRef, toast]);

  const checkHealth = useCallback(async () => {
    // Dedupe: se um check já está em voo (interval tick + trigger realtime),
    // ignora — nunca 2 health checks concorrentes.
    if (healthCheckInFlightRef.current) return;
    healthCheckInFlightRef.current = true;
    lastHealthCheckAtRef.current = Date.now();
    setLoading(true);
    const startTime = Date.now();
    try {
      // 1. Lovable DB (Internal)
      const { error: internalError } = await safeClient.from<{ id: string }>('profiles', (q) =>
        q.select('id').limit(1)
      );
      if (mountedRef.current) setLovableDb(!internalError);

      // 2. External DB (Evolution DB) — consolidated single-DB: same self-hosted instance
      const { error: extError } = await supabase.from('contacts').select('id').limit(1);
      const externalOk = !extError;
      if (mountedRef.current) setExternalDb(externalOk);

      // 3. WhatsApp Transport
      const transport = await whatsapp.resolveTransport();
      const currentTransportLabel = `${transport.requestedMode}${transport.degraded ? ' (DEGRADED)' : ''}`;
      if (mountedRef.current) setWhatsappTransport(currentTransportLabel);

      // 4. Recent Message Traffic — count uses count:'exact'+head:true (no row transfer)
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      // provider_message_log is physical in zapp schema (moved from public via migration 20260717114421)
      const { count: msgCount, data: lastMsgRaw } = await (
        supabase as unknown as { from(t: string): ReturnType<typeof supabase.from> }
      )
        .from('provider_message_log')
        .select('received_at', { count: 'exact' })
        .gt('received_at', fiveMinsAgo)
        .order('received_at', { ascending: false })
        .limit(1);
      const lastMsg = lastMsgRaw as Array<{ received_at: string }> | null;
      if (mountedRef.current)
        setRecentTraffic({ count: msgCount || 0, last_at: lastMsg?.[0]?.received_at || null });

      // 5. Active Alerts
      try {
        const { data: alerts } = await safeClient.from<ActiveAlert>('v_alerts_active', (q) =>
          q.select('*').limit(5)
        );
        if (mountedRef.current) setActiveAlerts(alerts || []);
      } catch {
        if (mountedRef.current) setActiveAlerts([]);
      }

      // 6. Real instance count from Evolution API (via proxy) — replaces hardcoded 0
      try {
        const { data: proxyData, error: proxyError } =
          await listInstances();
        if (!proxyError) {
          const instances = Array.isArray(proxyData)
            ? proxyData
            : (proxyData as Record<string, unknown>)?.instances;
          if (Array.isArray(instances) && mountedRef.current) {
            setInstanceCount(instances.length);
          }
        } else if (mountedRef.current) {
          setInstanceCount(null);
        }
      } catch {
        if (mountedRef.current) setInstanceCount(null);
      }

      // 7. Uptime 24h — real data from v_connection_uptime (no fabricated 99.9%)
      try {
        const { data: uptimeRows } = await safeClient.from<{ uptime_percentage: number | null }>(
          'v_connection_uptime',
          (q) => q.select('uptime_percentage').limit(100)
        );
        const percentages = (uptimeRows || [])
          .map((r) => r.uptime_percentage)
          .filter((v): v is number => typeof v === 'number' && v >= 0);
        if (mountedRef.current) {
          if (percentages.length > 0) {
            // Normalize 0..1 ratios to 0..100 if the view reports them as fractions
            const max = Math.max(...percentages);
            const normalized = max <= 1 ? percentages.map((v) => v * 100) : percentages;
            setUptimePct(normalized.reduce((a, b) => a + b, 0) / normalized.length);
          } else {
            setUptimePct(null);
          }
        }
      } catch {
        if (mountedRef.current) setUptimePct(null);
      }

      if (!mountedRef.current) return;

      // Determine overall status
      if (!internalError && externalOk && !transport.degraded) {
        setStatus('online');
      } else if (!internalError) {
        setStatus('degraded');
      } else {
        setStatus('offline');
      }
      // Real measured latency of the health-check round-trip (before the artificial min-wait)
      setLatencyMs(Date.now() - startTime);
      setLastCheck(new Date());
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      log.error('Health check failed', error);
      setStatus('offline');
      setLatencyMs(null);
      toast({
        title: 'Erro na verificação',
        description:
          error instanceof Error ? error.message : 'Não foi possível validar todos os serviços.',
        variant: 'destructive',
      });
    } finally {
      const elapsed = Date.now() - startTime;
      const minWait = 600;
      if (elapsed < minWait) await new Promise((resolve) => setTimeout(resolve, minWait - elapsed));
      if (mountedRef.current) setLoading(false);
      healthCheckInFlightRef.current = false;
    }
  }, [toast, mountedRef]);

  const refreshNow = useCallback(() => {
    void checkHealth();
    setNextRefreshIn(REFRESH_INTERVAL);
  }, [checkHealth]);

  const fetchIncidents = useCallback(async () => {
    try {
      const { data } = await safeClient.from<SystemIncident>('system_health_incidents', (q) =>
        q.select('*').order('started_at', { ascending: false }).limit(10)
      );
      if (mountedRef.current) setIncidents(data || []);
    } catch (err) {
      // void fetchIncidents() no mount/realtime: sem try/catch, uma falha de
      // rede vira unhandled promise rejection (e incidentes ficam stale).
      log.error('Failed to fetch health incidents:', err);
    }
  }, [mountedRef]);

  useEffect(() => {
    void checkHealth();
    void fetchIncidents();

    const trafficSub = supabase
      .channel(`traffic-changes:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'provider_message_log' },
        () => {
          setRecentTraffic((prev) => ({
            ...prev,
            count: prev.count + 1,
            last_at: new Date().toISOString(),
          }));
        }
      )
      .subscribe();

    const alertsSub = supabase
      .channel(`health-incidents:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'system_health_incidents' },
        () => {
          void fetchIncidents();
          // Trigger realtime com a aba oculta não dispara health check (o
          // polling já está pausado por visibility).
          if (document.visibilityState === 'visible') {
            void checkHealth();
          }
        }
      )
      .subscribe();

    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        setNextRefreshIn((prev) => {
          if (prev <= 1) {
            // Aba oculta: pausa o polling (countdown parado em 1, sem fetch).
            if (document.visibilityState !== 'visible') return 1;
            // Intervalo mínimo de 60s desde o último check (inclui re-check
            // por visibilitychange/focus — não pode furar a cota).
            if (Date.now() - lastHealthCheckAtRef.current < REFRESH_INTERVAL * 1000) {
              return 1;
            }
            void checkHealth();
            return REFRESH_INTERVAL;
          }
          return prev - 1;
        });
      }, 1000);
    }

    // Voltou a ficar visível → re-check na hora: força o countdown a checar no
    // próximo tick (o gate do intervalo mínimo de 60s é aplicado no tick).
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setNextRefreshIn(1);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      trafficSub.unsubscribe();
      supabase.removeChannel(trafficSub);
      alertsSub.unsubscribe();
      supabase.removeChannel(alertsSub);
    };
  }, [fetchIncidents, checkHealth, autoRefresh]);

  const statusConfig = useMemo(() => {
    const config = {
      online: {
        color: 'bg-success text-success-foreground border-success/20',
        label: 'SISTEMA OPERACIONAL',
        description:
          'Todos os componentes estão respondendo dentro dos limites de latência esperados.',
      },
      degraded: {
        color: 'bg-warning text-warning-foreground border-warning/20',
        label: 'DESEMPENHO REDUZIDO',
        description: 'Um ou mais serviços estão com lentidão ou conectividade parcial.',
      },
      offline: {
        color: 'bg-destructive text-destructive-foreground border-destructive/20',
        label: 'SISTEMA INDISPONÍVEL',
        description: 'Interrupção crítica detectada. A ponte não consegue processar mensagens.',
      },
      loading: {
        color: 'bg-muted text-muted-foreground border-muted/20',
        label: 'VERIFICANDO...',
        description: 'Validando integridade dos schemas e conectividade de rede...',
      },
    };
    return config[status];
  }, [status]);

  return {
    loading,
    status,
    lastCheck,
    lovableDb,
    externalDb,
    whatsappTransport,
    activeAlerts,
    incidents,
    instanceCount,
    latencyMs,
    uptimePct,
    recentTraffic,
    diagResults,
    diagRunning,
    autoRefresh,
    setAutoRefresh,
    refreshInterval: REFRESH_INTERVAL,
    nextRefreshIn,
    checkHealth,
    refreshNow,
    runDiagnostics,
    statusConfig,
  };
}
