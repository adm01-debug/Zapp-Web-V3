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
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
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

const REFRESH_INTERVAL = 30;

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
  const [instanceCount] = useState<number>(0);
  const [recentTraffic, setRecentTraffic] = useState<{ count: number; last_at: string | null }>({
    count: 0,
    last_at: null,
  });
  const [diagResults, setDiagResults] = useState<DiagnosticResult[] | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_INTERVAL);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
    setLoading(true);
    const startTime = Date.now();
    try {
      // 1. Lovable DB (Internal)
      const { error: internalError } = await safeClient.from<{ id: string }>('profiles', (q) =>
        q.select('id').limit(1)
      );
      if (mountedRef.current) setLovableDb(!internalError);

      // 2. External DB (FATOR X / Evolution)
      let externalOk = false;
      if (isExternalConfigured) {
        const extSupabase = getExternalSupabase();
        if (extSupabase) {
          const { error: extError } = await extSupabase.from('contacts').select('id').limit(1);
          externalOk = !extError;
        }
      }
      if (mountedRef.current) setExternalDb(externalOk);

      // 3. WhatsApp Transport
      const transport = await whatsapp.resolveTransport();
      const currentTransportLabel = `${transport.requestedMode}${transport.degraded ? ' (DEGRADED)' : ''}`;
      if (mountedRef.current) setWhatsappTransport(currentTransportLabel);

      // 4. Recent Message Traffic — count uses count:'exact'+head:true (no row transfer)
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      // provider_message_log is in the 'zapp' schema, now present in zapp-schema generated types
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

      if (!mountedRef.current) return;

      // Determine overall status
      if (!internalError && externalOk && !transport.degraded) {
        setStatus('online');
      } else if (!internalError) {
        setStatus('degraded');
      } else {
        setStatus('offline');
      }
      setLastCheck(new Date());
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      log.error('Health check failed', error);
      setStatus('offline');
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
    }
  }, [toast, mountedRef]);

  const refreshNow = useCallback(() => {
    void checkHealth();
    setNextRefreshIn(REFRESH_INTERVAL);
  }, [checkHealth]);

  const fetchIncidents = useCallback(async () => {
    const { data } = await safeClient.from<SystemIncident>('system_health_incidents', (q) =>
      q.select('*').order('started_at', { ascending: false }).limit(10)
    );
    if (mountedRef.current) setIncidents(data || []);
  }, [mountedRef]);

  useEffect(() => {
    void checkHealth();
    void fetchIncidents();

    const trafficSub = supabase
      .channel('traffic-changes')
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
      .channel('health-incidents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'system_health_incidents' },
        () => {
          void fetchIncidents();
          void checkHealth();
        }
      )
      .subscribe();

    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        setNextRefreshIn((prev) => {
          if (prev <= 1) {
            void checkHealth();
            return REFRESH_INTERVAL;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
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
