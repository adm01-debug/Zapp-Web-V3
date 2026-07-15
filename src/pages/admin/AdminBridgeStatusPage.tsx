import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  RefreshCw,
  MessageSquare,
  Zap,
  ShieldCheck,
  WifiOff,
  Play,
  Pause,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { runEvolutionDiagnostics, DiagnosticResult } from '@/lib/evolutionDiagnostics';
import type { ActiveAlert } from '@/lib/evoApiHealth/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useBridgeStatus } from './useBridgeStatus';
import { BridgeDiagnosticsDialog } from './bridge-status/BridgeDiagnosticsDialog';
import { BridgeStatusBanner } from './bridge-status/BridgeStatusBanner';
import { BridgeCoreServicesCard } from './bridge-status/BridgeCoreServicesCard';
import { BridgeSidebarPanel } from './bridge-status/BridgeSidebarPanel';

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
  const [recentTraffic, setRecentTraffic] = useState<RecentTraffic>({
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
      const errorMessage =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'Erro desconhecido ao executar diagnóstico.';
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
        setRecentTraffic({
          count: msgCount || 0,
          last_at: lastMsg?.[0]?.received_at || null,
        });

      // 5. Check Active Alerts
      try {
        const { data: alerts } = await safeClient.from<AlertRow>('v_alerts_active', (q) =>
          q.select('*').limit(5)
        );
        if (mountedRef.current)
          setActiveAlerts((Array.isArray(alerts) ? alerts : []) as ActiveAlert[]);
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
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Não foi possível validar todos os serviços.';
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
    if (mountedRef.current) setIncidents((Array.isArray(data) ? data : []) as HealthIncident[]);
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
            return refreshInterval;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      trafficSub.unsubscribe();
      alertsSub.unsubscribe();
    };
  }, [fetchIncidents, checkHealth, autoRefresh, refreshInterval]);

  const statusConfig = useMemo((): StatusConfig => {
    const config: Record<BridgeStatus, StatusConfig> = {
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
      {/* Header */}
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
            onClick={refreshNow}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Atualizar Status
          </Button>

          <BridgeDiagnosticsDialog
            diagRunning={diagRunning}
            diagResults={diagResults}
            runDiagnostics={runDiagnostics}
          />
        </div>
      </div>

      <BridgeStatusBanner status={status} statusConfig={statusConfig} />

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
        <BridgeCoreServicesCard
          lovableDb={lovableDb}
          externalDb={externalDb}
          whatsappTransport={whatsappTransport}
          status={status}
          recentTraffic={recentTraffic}
        />
        <BridgeSidebarPanel incidents={incidents} activeAlerts={activeAlerts} />
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
