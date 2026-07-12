import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, PlayCircle, RefreshCw, Server, Shield } from 'lucide-react';
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
    await qc.invalidateQueries({ queryKey: ['evo-api-health'] });
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
          <Button onClick={() => runTests.mutate()} disabled={runTests.isPending}>
            <PlayCircle className="mr-2 h-4 w-4" />
            {runTests.isPending ? 'Rodando 50 testes…' : 'Run test suite'}
          </Button>
        </div>
      </div>

      {/* Readiness & Test Result Banners */}
      <div className="space-y-3">
        {readiness && (
          <Alert variant={readiness.overall?.includes('🟢') ? 'default' : 'destructive'}>
            <Shield className="h-4 w-4" />
            <AlertTitle>{readiness.overall}</AlertTitle>
            <AlertDescription>
              {readiness.tables_count} tabelas · {readiness.fk_count} FKs ·{' '}
              {readiness.realtime_count} Realtime · {readiness.cron_jobs} cron jobs
            </AlertDescription>
          </Alert>
        )}

        {runTestsData && (
          <Alert variant={runTestsData.overall?.includes('🟢') ? 'default' : 'destructive'}>
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
            <HealthTab data={dashboardData} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="alerts">
          <SectionErrorBoundary sectionName="Alertas">
            <AlertsTab
              alerts={alertsData}
              onAcknowledge={(id) => ack.mutate(id)}
              isAcknowledging={ack.isPending}
            />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="channels">
          <SectionErrorBoundary sectionName="Canais de Alerta">
            <ChannelsTab
              channels={channels.data?.data}
              onTest={(id) => testChan.mutate(id)}
              isTesting={testChan.isPending}
              testResult={testChan.data}
            />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="history">
          <SectionErrorBoundary sectionName="Histórico">
            <HistoryTab history={history.data?.data} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="dr">
          <SectionErrorBoundary sectionName="DR">
            <DrTab drHealth={drHealth.data?.data} runbook={runbook.data?.data} />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
