import { useMemo, useRef, useState } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, PlayCircle, RefreshCw, Server, Shield } from 'lucide-react';
import type { PipelineReadiness } from '@/lib/evoApiHealth/types';
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
} from '@/lib/evoApiHealth/hooks';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { HealthTab } from '@/components/evoApiHealth/tabs/HealthTab';
import { AlertsTab } from '@/components/evoApiHealth/tabs/AlertsTab';
import { ChannelsTab } from '@/components/evoApiHealth/tabs/ChannelsTab';
import { HistoryTab } from '@/components/evoApiHealth/tabs/HistoryTab';
import { DrTab } from '@/components/evoApiHealth/tabs/DrTab';

/** Maps a `PipelineReadiness` snapshot to a Badge variant: `destructive` if any status field is non-OK, otherwise `default`. */
function deriveReadinessVariant(r?: PipelineReadiness): 'default' | 'destructive' {
  if (!r) return 'default';
  const bad = [r.tables_status, r.enums_status, r.fk_status, r.realtime_status, r.replica_full_status].some(
    (s) => s && !s.toLowerCase().includes('ok') && !s.includes('🟢')
  );
  return bad ? 'destructive' : 'default';
}

const RATE_LIMIT_MS = 5 * 60 * 1000;

/** Admin Evo Api Health Page. */
export default function AdminEvoApiHealthPage() {
  const qc = useQueryClient();
  const dash = useEvoApiDashboard();
  const alerts = useActiveAlerts();
  const ack = useAcknowledgeAlert();
  const history = useHealthHistory();
  const channels = useAlertChannels();
  const testChan = useTestAlertChannel();
  const runbook = useDrRunbook();
  const drHealth = useDrHealth();
  const runTests = useRunTestSuite();
  const { toast } = useToast();
  const lastRunRef = useRef<number>(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Memoized values to prevent unnecessary re-renders of the large layout
  const { schemaUnavailable, dashboardData, alertsData, runTestsData, readiness } = useMemo(
    () => ({
      schemaUnavailable: dash.data?.schema_unavailable || alerts.data?.schema_unavailable,
      dashboardData: dash.data?.data,
      alertsData: alerts.data?.data,
      runTestsData: runTests.data?.data,
      readiness: dash.data?.data?.readiness,
    }),
    [dash.data, alerts.data, runTests.data]
  );

  const handleRefresh = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.adminOps.evoApiHealth() });
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      {schemaUnavailable && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            Schema <code>evo_api</code> não está exposto no PostgREST
          </AlertTitle>
          <AlertDescription>
            Para esta página funcionar, o admin do FATOR X precisa adicionar
            <code className="mx-1">evo_api</code> em{' '}
            <strong>Settings → API → Exposed schemas</strong>
            (ou ajustar <code>db-schemas</code> em <code>postgrest</code>) e reiniciar o PostgREST.
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Server className="h-7 w-7 text-primary" />
            Evolution API · FATOR X
          </h1>
          <p className="mt-1 text-muted-foreground">
            Saúde, alertas e integridade do schema{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">evo_api</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={dash.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${dash.isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button disabled={runTests.isPending}>
                <PlayCircle className="mr-2 h-4 w-4" />
                {runTests.isPending
                  ? `Rodando ${runTestsData?.total_tests ?? 50} testes…`
                  : 'Run test suite'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar execução da suite de testes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso executa até {runTestsData?.total_tests ?? 50} testes contra o banco de
                  produção. Limite: 1 execução a cada 5 minutos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const now = Date.now();
                    if (now - lastRunRef.current < RATE_LIMIT_MS) {
                      const remaining = Math.ceil((RATE_LIMIT_MS - (now - lastRunRef.current)) / 1000);
                      toast({
                        title: 'Aguarde antes de repetir',
                        description: `Próxima execução disponível em ${remaining}s.`,
                        variant: 'destructive',
                      });
                      return;
                    }
                    lastRunRef.current = now;
                    runTests.mutate();
                  }}
                >
                  Executar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Readiness & Test Result Banners */}
      <div className="space-y-3">
        {readiness && (
          <Alert variant={deriveReadinessVariant(readiness)}>
            <Shield className="h-4 w-4" />
            <AlertTitle>{readiness.overall}</AlertTitle>
            <AlertDescription>
              {readiness.tables_count} tabelas · {readiness.fk_count} FKs ·{' '}
              {readiness.realtime_count} Realtime · {readiness.cron_jobs} cron jobs
            </AlertDescription>
          </Alert>
        )}

        {runTestsData && (
          <Alert variant={runTestsData.failed > 0 ? 'destructive' : 'default'}>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>{runTestsData.overall}</AlertTitle>
            <AlertDescription>
              {runTestsData.passed}/{runTestsData.total_tests} testes passando (
              {runTestsData.pass_rate_pct}%)
            </AlertDescription>
          </Alert>
        )}

        {dash.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Falha ao carregar dashboard</AlertTitle>
            <AlertDescription>{(dash.error as Error)?.message}</AlertDescription>
          </Alert>
        )}
      </div>

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Saúde</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            Alertas
            {alertsData?.length ? <Badge variant="destructive">{alertsData.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="channels">Canais</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="dr">DR</TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <SectionErrorBoundary sectionName="Saúde">
            <HealthTab data={dashboardData ?? undefined} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="alerts">
          <SectionErrorBoundary sectionName="Alertas">
            <AlertsTab
              alerts={alertsData ?? undefined}
              onAcknowledge={(id) => ack.mutate(id)}
              isAcknowledging={ack.isPending}
            />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="channels">
          <SectionErrorBoundary sectionName="Canais de Alerta">
            <ChannelsTab
              channels={channels.data?.data ?? undefined}
              onTest={(id) => testChan.mutate(id)}
              isTesting={testChan.isPending}
              testResult={testChan.data}
            />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="history">
          <SectionErrorBoundary sectionName="Histórico">
            <HistoryTab history={history.data?.data ?? undefined} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="dr">
          <SectionErrorBoundary sectionName="DR">
            <DrTab
              drHealth={drHealth.data?.data ?? undefined}
              runbook={runbook.data?.data ?? undefined}
            />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
