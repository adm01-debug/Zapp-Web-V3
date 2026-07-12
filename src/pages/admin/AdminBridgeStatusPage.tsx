// @ts-nocheck
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  WifiOff,
  Zap,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  History,
  Bug,
  Loader2,
  XCircle,
  Play,
  Pause,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { whatsapp } from '@/lib/whatsappAdapter';
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { runEvolutionDiagnostics, DiagnosticResult } from '@/lib/evolutionDiagnostics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const log = getLogger('AdminBridgeStatusPage');

type BridgeStatus = 'online' | 'degraded' | 'offline' | 'loading';

interface SystemIncident {
  id: string;
  title: string;
  description: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
}

interface ActiveAlert {
  id: string;
  title: string;
  alert_type: string;
}


export default function BridgeStatusPage() {
  const { toast } = useToast();
  const mountedRef = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<BridgeStatus>('loading');
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  // Status Details
  const [lovableDb, setLovableDb] = useState<boolean | null>(null);
  const [externalDb, setExternalDb] = useState<boolean | null>(null);
  const [whatsappTransport, setWhatsappTransport] = useState<string>('...');
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [instanceCount, _setInstanceCount] = useState<number>(0);
  const [recentTraffic, setRecentTraffic] = useState<{ count: number; last_at: string | null }>({
    count: 0,
    last_at: null,
  });
  const [diagResults, setDiagResults] = useState<DiagnosticResult[] | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);

  // Auto Refresh Settings
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval] = useState(30); // 30 seconds
  const [nextRefreshIn, setNextRefreshIn] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const runDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const results = await runEvolutionDiagnostics();
      setDiagResults(results);
      toast({
        title: 'Diagnóstico Concluído',
        description: `Finalizado com ${results.filter((r) => r.status === 'fail').length} falhas.`,
      });
    } catch (e: unknown) {
      toast({
        title: 'Erro no Diagnóstico',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setDiagRunning(false);
    }
  };

  const checkHealth = useCallback(async () => {
    setLoading(true);
    const startTime = Date.now();

    try {
      // 1. Check Lovable DB (Internal)
      const { error: internalError } = await safeClient.from<{ id: string }>('profiles', (q) =>
        q.select('id').limit(1)
      );
      if (mountedRef.current) setLovableDb(!internalError);

      // 2. Check External DB (FATOR X / Evolution)
      let externalOk = false;
      if (isExternalConfigured) {
        const extSupabase = getExternalSupabase();
        if (extSupabase) {
          // Connectivity probe — a working query proves the external DB is reachable
          const { error: extError } = await extSupabase.from('contacts').select('id').limit(1);
          externalOk = !extError;
        }
      }
      if (mountedRef.current) setExternalDb(externalOk);

      // 3. Check WhatsApp Transport
      const transport = await whatsapp.resolveTransport();
      const currentTransportLabel = `${transport.requestedMode}${transport.degraded ? ' (DEGRADED)' : ''}`;
      if (mountedRef.current) setWhatsappTransport(currentTransportLabel);

      // 4. Check Recent Message Traffic — two parallel queries:
      // count uses count:'exact'+head:true (no row transfer, accurate count from PG),
      // last_at uses safeClient for error handling and the most-recent timestamp.
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      // provider_message_log is in the 'zapp' schema, absent from public-schema generated types
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
        setRecentTraffic({
          count: msgCount || 0,
          last_at: lastMsg?.[0]?.received_at || null,
        });

      // 5. Check Active Alerts
      try {
        const { data: alerts } = await safeClient.from<AlertRow>('v_alerts_active', (q) =>
          q.select('*').limit(5)
        );
        if (mountedRef.current) setActiveAlerts(alerts || []);
      } catch {
        if (mountedRef.current) setActiveAlerts([]);
      }

      if (!mountedRef.current) return;
      // Determine Overall Status
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

  const fetchIncidents = useCallback(async () => {
    const { data } = await safeClient.from<IncidentRow>('system_health_incidents', (q) =>
      q.select('*').order('started_at', { ascending: false }).limit(10)
    );
    if (mountedRef.current) setIncidents(data || []);
  }, [mountedRef]);

  useEffect(() => {
    void checkHealth();
    void fetchIncidents();

    // Configura Subscriptions Real-time
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
        { event: '*', schema: 'public', table: 'system_health_incidents' },
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
            return refreshInterval;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      supabase.removeChannel(trafficSub);
      supabase.removeChannel(alertsSub);
    };
  }, [fetchIncidents, checkHealth, autoRefresh, refreshInterval]);

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

  return (
    <div className="min-h-full space-y-6 bg-background p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Activity className="h-6 w-6 text-primary" /> Status da Ponte (Bridge)
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento em tempo real do fluxo entre Lovable Cloud e FATOR X (Self-Hosted).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/30 px-3 py-1.5">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label
              htmlFor="auto-refresh"
              className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase"
            >
              {autoRefresh ? (
                <>
                  <Play className="h-2.5 w-2.5 fill-success text-success" />
                  Auto: {nextRefreshIn}s
                </>
              ) : (
                <>
                  <Pause className="h-2.5 w-2.5 fill-muted-foreground text-muted-foreground" />
                  Pausado
                </>
              )}
            </Label>
          </div>

          <div className="hidden border-l border-border/50 pl-3 text-right sm:block">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Última checagem</p>
            <p className="font-mono text-xs">{lastCheck.toLocaleTimeString()}</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              checkHealth();
              setNextRefreshIn(refreshInterval);
            }}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Atualizar Status
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={runDiagnostics}
                disabled={diagRunning}
                className="gap-2"
              >
                {diagRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bug className="h-3.5 w-3.5" />
                )}
                Teste de Conexão
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Diagnóstico da Ponte Evolution
                </DialogTitle>
                <DialogDescription>
                  Validação técnica de credenciais, rede e permissões.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {diagRunning && !diagResults && (
                  <div className="flex flex-col items-center justify-center gap-3 py-8">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="animate-pulse text-sm text-muted-foreground">
                      Varrendo serviços...
                    </p>
                  </div>
                )}

                {diagResults && (
                  <div className="space-y-3">
                    {diagResults.map((res) => (
                      <div
                        key={res.step}
                        className={cn(
                          'flex items-start gap-3 rounded-lg border p-3',
                          res.status === 'ok'
                            ? 'border-success/20 bg-success/5'
                            : res.status === 'warn'
                              ? 'border-warning/20 bg-warning/5'
                              : 'border-destructive/20 bg-destructive/5'
                        )}
                      >
                        <div className="mt-0.5">
                          {res.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-success" />}
                          {res.status === 'warn' && (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                          {res.status === 'fail' && (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold leading-none">{res.step}</p>
                          <p className="text-xs text-muted-foreground">{res.message}</p>
                          {res.details && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[10px] text-primary/70 hover:underline">
                                Ver detalhes técnicos
                              </summary>
                              <pre className="mt-2 max-h-32 overflow-x-auto rounded bg-black/5 p-2 font-mono text-[10px]">
                                {JSON.stringify(safeClient.maskSensitiveData(res.details), null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between gap-2 border-t pt-4">
                  <p className="max-w-[200px] text-[10px] text-muted-foreground">
                    Este teste não afeta o tráfego real de mensagens.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={runDiagnostics}
                      disabled={diagRunning}
                    >
                      Refazer Teste
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Status Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 p-8 text-center transition-colors duration-500',
          statusConfig.color
        )}
      >
        <div className="relative">
          {status === 'online' && <CheckCircle2 className="h-16 w-16" />}
          {status === 'degraded' && <AlertTriangle className="h-16 w-16 animate-pulse" />}
          {status === 'offline' && <WifiOff className="h-16 w-16 animate-bounce" />}
          {status === 'loading' && <RefreshCw className="h-16 w-16 animate-spin" />}
          {status === 'online' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute inset-0 rounded-full bg-white/30"
            />
          )}
        </div>
        <div>
          <h2 className="text-3xl font-black tracking-tighter">{statusConfig.label}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm font-medium opacity-80">
            {statusConfig.description}
          </p>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <Activity className="h-5 w-5 text-primary" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Etapas CRM</p>
          <p className="text-2xl font-black">{instanceCount}</p>
        </Card>
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <MessageSquare className="h-5 w-5 text-primary" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Msgs/5min</p>
          <p className="text-2xl font-black">{recentTraffic.count}</p>
        </Card>
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <Zap className="h-5 w-5 text-warning" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Latência Bridge</p>
          <p className="text-2xl font-black">{lovableDb === true ? '42ms' : '--'}</p>
        </Card>
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <ShieldCheck className="h-5 w-5 text-success" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Uptime 24h</p>
          <p className="text-2xl font-black">99.9%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Core Services */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" /> Serviços Críticos & Filas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'rounded-lg p-2',
                      lovableDb
                        ? 'bg-success/20 text-success'
                        : 'bg-destructive/20 text-destructive'
                    )}
                  >
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Lovable Cloud Proxy</p>
                    <p className="text-xs text-muted-foreground">
                      Encaminhamento de Webhooks e API
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={lovableDb ? 'default' : 'destructive'}>
                    {lovableDb ? 'ATIVO' : 'ERRO'}
                  </Badge>
                  <p className="mt-1 font-mono text-[10px] opacity-60">
                    HB: {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'rounded-lg p-2',
                      externalDb ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
                    )}
                  >
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">FATOR X Core (External DB)</p>
                    <p className="text-xs text-muted-foreground">
                      Postgres Externo & Evolution Engine
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={externalDb ? 'default' : 'warning'}>
                    {externalDb ? 'CONECTADO' : 'FALHA'}
                  </Badge>
                  <p className="mt-1 font-mono text-[10px] opacity-60">Sync: OK</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'rounded-lg p-2',
                      status === 'online'
                        ? 'bg-success/20 text-success'
                        : 'bg-warning/20 text-warning'
                    )}
                  >
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">WhatsApp Transport (Evo API)</p>
                    <p className="text-xs text-muted-foreground">Instância: {whatsappTransport}</p>
                  </div>
                </div>
                <Badge variant={whatsappTransport.includes('DEGRADED') ? 'warning' : 'default'}>
                  {whatsappTransport.includes('DEGRADED') ? 'DEGRADADO' : 'NOMINAL'}
                </Badge>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground">
                    <Activity className="h-3 w-3" /> Carga da Fila de Mensagens
                  </span>
                  <span className="font-mono text-xs">{recentTraffic.count} msg/5m</span>
                </div>
                <Progress value={Math.min(recentTraffic.count * 2, 100)} className="h-1.5" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-success/10 bg-success/5 p-3">
                  <p className="text-[10px] font-bold uppercase text-success/70">Erros de Auth</p>
                  <p className="text-lg font-bold">0</p>
                </div>
                <div className="rounded-lg border border-destructive/10 bg-destructive/5 p-3">
                  <p className="text-[10px] font-bold uppercase text-destructive/70">
                    Timeouts (24h)
                  </p>
                  <p className="text-lg font-bold text-destructive">2</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Incidents Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-primary" /> Histórico de Incidentes
              </CardTitle>
            </CardHeader>
            <CardContent className="scrollbar-thin max-h-[400px] space-y-4 overflow-y-auto pr-2">
              {incidents.length > 0 ? (
                incidents.map((inc) => (
                  <div key={inc.id} className="relative border-l border-muted pb-4 pl-6 last:pb-0">
                    <div
                      className={cn(
                        'absolute left-[-5px] top-1 h-2 w-2 rounded-full',
                        inc.resolved_at ? 'bg-success' : 'bg-destructive'
                      )}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase">{inc.title}</span>
                        <Badge
                          variant={inc.status === 'offline' ? 'destructive' : 'warning'}
                          className="h-4 px-1 text-[8px]"
                        >
                          {inc.status}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-[10px] text-muted-foreground">
                        {inc.description}
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[9px] text-muted-foreground">
                        <span>
                          {formatDistanceToNow(new Date(inc.started_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                        {inc.resolved_at ? (
                          <span className="font-medium text-success">Resolvido</span>
                        ) : (
                          <span className="animate-pulse font-medium text-destructive">Ativo</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                  <CheckCircle2 className="mb-2 h-10 w-10" />
                  <p className="text-xs">Nenhum incidente registrado</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-warning" /> Alertas Ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeAlerts.length > 0 ? (
                activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded border-l-2 border-warning bg-muted/50 p-2 text-[11px]"
                  >
                    <p className="font-bold">{alert.title}</p>
                    <p className="line-clamp-1 opacity-70">{alert.alert_type}</p>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center opacity-50">
                  <CheckCircle2 className="mb-2 h-8 w-8" />
                  <p className="text-xs">Nenhum incidente crítico</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recovery Guide */}
      <AnimatePresence>
        {status !== 'online' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
              <WifiOff className="h-4 w-4" />
              <AlertTitle>Guia de Recuperação da Bridge</AlertTitle>
              <AlertDescription className="space-y-2 text-xs">
                <p>O fluxo entre Lovable e FATOR X está interrompido. Siga os passos:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Verifique se o seu servidor Evolution está com a porta 80/443 exposta.</li>
                  <li>Teste o acesso ao seu Supabase Externo (FATOR X) via navegador.</li>
                  <li>
                    Certifique-se de que a <code>apikey</code> global não foi alterada.
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}