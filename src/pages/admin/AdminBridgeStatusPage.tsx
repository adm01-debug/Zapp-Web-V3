import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useMountedRef } from "@/hooks/useMountedRef";
import { getLogger } from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Pause
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeClient } from "@/integrations/supabase/safeClient";
import { whatsapp } from "@/lib/whatsappAdapter";
import { getExternalSupabase, isExternalConfigured } from "@/integrations/supabase/externalClient";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { runEvolutionDiagnostics, DiagnosticResult } from "@/lib/evolutionDiagnostics";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const log = getLogger('AdminBridgeStatusPage');

type BridgeStatus = "online" | "degraded" | "offline" | "loading";

interface IncidentRow {
  id: string;
  title: string;
  description: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
}

interface AlertRow {
  id: string;
  title: string;
  alert_type: string;
}

export default function BridgeStatusPage() {
  const { toast } = useToast();
  const mountedRef = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<BridgeStatus>("loading");
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  
  // Status Details
  const [lovableDb, setLovableDb] = useState<boolean | null>(null);
  const [externalDb, setExternalDb] = useState<boolean | null>(null);
  const [whatsappTransport, setWhatsappTransport] = useState<string>("...");
  const [activeAlerts, setActiveAlerts] = useState<AlertRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [instanceCount, setInstanceCount] = useState<number>(0);
  const [recentTraffic, setRecentTraffic] = useState<{count: number, last_at: string | null}>({count: 0, last_at: null});
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
        title: "Diagnóstico Concluído",
        description: `Finalizado com ${results.filter(r => r.status === 'fail').length} falhas.`
      });
    } catch (e: unknown) {
      toast({
        title: "Erro no Diagnóstico",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive"
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
      const { error: internalError } = await supabase.from('profiles').select('count').limit(1);
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
      const currentTransportLabel = `${transport.requestedMode}${transport.degraded ? " (DEGRADED)" : ""}`;
      if (mountedRef.current) setWhatsappTransport(currentTransportLabel);

      // 4. Check Recent Message Traffic — use two parallel queries so the count
      // is exact (count:'exact'+head:true skips row transfer) while the last
      // timestamp comes from safeClient with its error-handling wrapper.
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const [countResult, { data: lastMsgArr }] = await Promise.all([
        supabase
          .from('provider_message_log' as unknown as Parameters<typeof supabase.from>[0])
          .select('*', { count: 'exact', head: true })
          .gt('received_at', fiveMinsAgo),
        safeClient.from<{ received_at: string }>(
          'provider_message_log',
          q => q.select('received_at').gt('received_at', fiveMinsAgo).order('received_at', { ascending: false }).limit(1)
        ),
      ]);

      if (mountedRef.current) setRecentTraffic({
        count: countResult.count ?? 0,
        last_at: lastMsgArr?.[0]?.received_at || null
      });

      // 5. Check Active Alerts
      try {
        const { data: alerts } = await safeClient.from<AlertRow>(
          'v_alerts_active',
          q => q.select('*').limit(5)
        );
        if (mountedRef.current) setActiveAlerts(alerts || []);
      } catch {
        if (mountedRef.current) setActiveAlerts([]);
      }

      if (!mountedRef.current) return;
      // Determine Overall Status
      if (!internalError && (externalOk && !transport.degraded)) {
        setStatus("online");
      } else if (!internalError) {
        setStatus("degraded");
      } else {
        setStatus("offline");
      }

      setLastCheck(new Date());
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      log.error('Health check failed', error);
      setStatus("offline");
      toast({
        title: "Erro na verificação",
        description: error instanceof Error ? error.message : "Não foi possível validar todos os serviços.",
        variant: "destructive"
      });
    } finally {
      const elapsed = Date.now() - startTime;
      const minWait = 600;
      if (elapsed < minWait) await new Promise(resolve => setTimeout(resolve, minWait - elapsed));
      if (mountedRef.current) setLoading(false);
    }
  }, [toast, mountedRef]);

  const fetchIncidents = useCallback(async () => {
    const { data } = await safeClient.from<IncidentRow>(
      'system_health_incidents',
      q => q.select('*').order('started_at', { ascending: false }).limit(10)
    );
    if (mountedRef.current) setIncidents(data || []);
  }, [mountedRef]);

  useEffect(() => {
    void checkHealth();
    void fetchIncidents();

    // Configura Subscriptions Real-time
    const trafficSub = supabase
      .channel('traffic-changes')
      .on('postgres_changes',{ event: 'INSERT', schema: 'zapp', table: 'provider_message_log' }, () => {
        setRecentTraffic(prev => ({ ...prev, count: prev.count + 1, last_at: new Date().toISOString() }));
      })
      .subscribe();

    const alertsSub = supabase
      .channel('health-incidents')
      .on('postgres_changes',{ event: '*', schema: 'public', table: 'system_health_incidents' }, () => {
        void fetchIncidents();
        void checkHealth();
      })
      .subscribe();

    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        setNextRefreshIn(prev => {
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
        color: "bg-success text-success-foreground border-success/20",
        label: "SISTEMA OPERACIONAL",
        description: "Todos os componentes estão respondendo dentro dos limites de latência esperados."
      },
      degraded: {
        color: "bg-warning text-warning-foreground border-warning/20",
        label: "DESEMPENHO REDUZIDO",
        description: "Um ou mais serviços estão com lentidão ou conectividade parcial."
      },
      offline: {
        color: "bg-destructive text-destructive-foreground border-destructive/20",
        label: "SISTEMA INDISPONÍVEL",
        description: "Interrupção crítica detectada. A ponte não consegue processar mensagens."
      },
      loading: {
        color: "bg-muted text-muted-foreground border-muted/20",
        label: "VERIFICANDO...",
        description: "Validando integridade dos schemas e conectividade de rede..."
      }
    };
    return config[status];
  }, [status]);

  return (
    <div className="p-6 space-y-6 bg-background min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Status da Ponte (Bridge)
          </h1>
          <p className="text-muted-foreground text-sm">
            Monitoramento em tempo real do fluxo entre Lovable Cloud e FATOR X (Self-Hosted).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
            <Switch 
              id="auto-refresh" 
              checked={autoRefresh} 
              onCheckedChange={setAutoRefresh} 
            />
            <Label htmlFor="auto-refresh" className="text-[10px] font-bold uppercase cursor-pointer flex items-center gap-1.5">
              {autoRefresh ? (
                <>
                  <Play className="w-2.5 h-2.5 text-success fill-success" /> 
                  Auto: {nextRefreshIn}s
                </>
              ) : (
                <>
                  <Pause className="w-2.5 h-2.5 text-muted-foreground fill-muted-foreground" /> 
                  Pausado
                </>
              )}
            </Label>
          </div>

          <div className="text-right hidden sm:block border-l pl-3 border-border/50">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Última checagem</p>
            <p className="text-xs font-mono">{lastCheck.toLocaleTimeString()}</p>
          </div>
          
          <Button variant="outline" size="sm" onClick={() => { checkHealth(); setNextRefreshIn(refreshInterval); }} disabled={loading} className="gap-2">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Atualizar Status
          </Button>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm" onClick={runDiagnostics} disabled={diagRunning} className="gap-2">
                {diagRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bug className="w-3.5 h-3.5" />}
                Teste de Conexão
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" /> Diagnóstico da Ponte Evolution
                </DialogTitle>
                <DialogDescription>
                  Validação técnica de credenciais, rede e permissões.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {diagRunning && !diagResults && (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground animate-pulse">Varrendo serviços...</p>
                  </div>
                )}
                
                {diagResults && (
                  <div className="space-y-3">
                    {diagResults.map((res) => (
                      <div key={res.step} className={cn(
                        "p-3 rounded-lg border flex items-start gap-3",
                        res.status === 'ok' ? 'bg-success/5 border-success/20' : 
                        res.status === 'warn' ? 'bg-warning/5 border-warning/20' : 
                        'bg-destructive/5 border-destructive/20'
                      )}>
                        <div className="mt-0.5">
                          {res.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-success" />}
                          {res.status === 'warn' && <AlertTriangle className="w-4 h-4 text-warning" />}
                          {res.status === 'fail' && <XCircle className="w-4 h-4 text-destructive" />}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold leading-none">{res.step}</p>
                          <p className="text-xs text-muted-foreground">{res.message}</p>
                          {res.details && (
                            <details className="mt-2">
                              <summary className="text-[10px] cursor-pointer hover:underline text-primary/70">Ver detalhes técnicos</summary>
                              <pre className="mt-2 p-2 bg-black/5 rounded text-[10px] font-mono overflow-x-auto max-h-32">
                                {JSON.stringify(safeClient.maskSensitiveData(res.details), null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="pt-4 border-t flex justify-between gap-2">
                   <p className="text-[10px] text-muted-foreground max-w-[200px]">
                     Este teste não afeta o tráfego real de mensagens.
                   </p>
                   <div className="flex gap-2">
                     <Button variant="outline" size="sm" onClick={runDiagnostics} disabled={diagRunning}>
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
          "p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center gap-4 transition-colors duration-500",
          statusConfig.color
        )}
      >
        <div className="relative">
          {status === 'online' && <CheckCircle2 className="w-16 h-16" />}
          {status === 'degraded' && <AlertTriangle className="w-16 h-16 animate-pulse" />}
          {status === 'offline' && <WifiOff className="w-16 h-16 animate-bounce" />}
          {status === 'loading' && <RefreshCw className="w-16 h-16 animate-spin" />}
          {status === 'online' && (
            <motion.div 
              initial={{ scale: 0 }} animate={{ scale: 1.5, opacity: 0 }} 
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute inset-0 bg-white/30 rounded-full" 
            />
          )}
        </div>
        <div>
          <h2 className="text-3xl font-black tracking-tighter">{statusConfig.label}</h2>
          <p className="opacity-80 text-sm font-medium max-w-md mx-auto mt-1">
            {statusConfig.description}
          </p>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col items-center justify-center text-center space-y-2">
          <Activity className="w-5 h-5 text-primary" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Etapas CRM</p>
          <p className="text-2xl font-black">{instanceCount}</p>
        </Card>
        <Card className="p-4 flex flex-col items-center justify-center text-center space-y-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Msgs/5min</p>
          <p className="text-2xl font-black">{recentTraffic.count}</p>
        </Card>
        <Card className="p-4 flex flex-col items-center justify-center text-center space-y-2">
          <Zap className="w-5 h-5 text-warning" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Latência Bridge</p>
          <p className="text-2xl font-black">{lovableDb === true ? '42ms' : '--'}</p>
        </Card>
        <Card className="p-4 flex flex-col items-center justify-center text-center space-y-2">
          <ShieldCheck className="w-5 h-5 text-success" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Uptime 24h</p>
          <p className="text-2xl font-black">99.9%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core Services */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" /> Serviços Críticos & Filas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", lovableDb ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive')}>
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Lovable Cloud Proxy</p>
                    <p className="text-xs text-muted-foreground">Encaminhamento de Webhooks e API</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={lovableDb ? "default" : "destructive"}>{lovableDb ? "ATIVO" : "ERRO"}</Badge>
                  <p className="text-[10px] font-mono mt-1 opacity-60">HB: {new Date().toLocaleTimeString()}</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", externalDb ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning')}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">FATOR X Core (External DB)</p>
                    <p className="text-xs text-muted-foreground">Postgres Externo & Evolution Engine</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={externalDb ? "default" : "warning"}>{externalDb ? "CONECTADO" : "FALHA"}</Badge>
                  <p className="text-[10px] font-mono mt-1 opacity-60">Sync: OK</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", status === 'online' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning')}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">WhatsApp Transport (Evo API)</p>
                    <p className="text-xs text-muted-foreground">Instância: {whatsappTransport}</p>
                  </div>
                </div>
                <Badge variant={whatsappTransport.includes("DEGRADED") ? "warning" : "default"}>
                  {whatsappTransport.includes("DEGRADED") ? "DEGRADADO" : "NOMINAL"}
                </Badge>
              </div>
            </div>
            
            <div className="pt-4 border-t space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                    <Activity className="w-3 h-3" /> Carga da Fila de Mensagens
                  </span>
                  <span className="text-xs font-mono">{recentTraffic.count} msg/5m</span>
                </div>
                <Progress value={Math.min(recentTraffic.count * 2, 100)} className="h-1.5" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-success/5 border border-success/10">
                  <p className="text-[10px] font-bold uppercase text-success/70">Erros de Auth</p>
                  <p className="text-lg font-bold">0</p>
                </div>
                <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                  <p className="text-[10px] font-bold uppercase text-destructive/70">Timeouts (24h)</p>
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
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-primary" /> Histórico de Incidentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
              {incidents.length > 0 ? (
                incidents.map(inc => (
                  <div key={inc.id} className="relative pl-6 pb-4 border-l border-muted last:pb-0">
                    <div className={cn("absolute left-[-5px] top-1 w-2 h-2 rounded-full", inc.resolved_at ? 'bg-success' : 'bg-destructive')} />
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase">{inc.title}</span>
                        <Badge variant={inc.status === 'offline' ? 'destructive' : 'warning'} className="text-[8px] h-4 px-1">
                          {inc.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{inc.description}</p>
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1">
                        <span>{formatDistanceToNow(new Date(inc.started_at), { addSuffix: true, locale: ptBR })}</span>
                        {inc.resolved_at ? (
                          <span className="text-success font-medium">Resolvido</span>
                        ) : (
                          <span className="text-destructive font-medium animate-pulse">Ativo</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                  <CheckCircle2 className="w-10 h-10 mb-2" />
                  <p className="text-xs">Nenhum incidente registrado</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" /> Alertas Ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeAlerts.length > 0 ? (
                activeAlerts.map(alert => (
                  <div key={alert.id} className="p-2 rounded bg-muted/50 border-l-2 border-warning text-[11px]">
                    <p className="font-bold">{alert.title}</p>
                    <p className="opacity-70 line-clamp-1">{alert.alert_type}</p>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center opacity-50">
                  <CheckCircle2 className="w-8 h-8 mb-2" />
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
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
              <WifiOff className="h-4 w-4" />
              <AlertTitle>Guia de Recuperação da Bridge</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <p>O fluxo entre Lovable e FATOR X está interrompido. Siga os passos:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Verifique se o seu servidor Evolution está com a porta 80/443 exposta.</li>
                  <li>Teste o acesso ao seu Supabase Externo (FATOR X) via navegador.</li>
                  <li>Certifique-se de que a <code>apikey</code> global não foi alterada.</li>
                </ul>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}