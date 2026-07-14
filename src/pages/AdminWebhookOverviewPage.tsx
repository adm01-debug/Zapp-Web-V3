/**
 * Admin: Webhook Overview Dashboard.
 * Aggregated view of `evolution_webhook_events` over a configurable window
 * with charts and per-instance breakdown. Drill-down lives in
 * `AdminWebhookEventsPage`.
 */
import {
  Webhook,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  Server,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { cn } from '@/lib/utils';
import { KpiCard } from './admin-webhook-overview/KpiCard';
import { LoadingSkeleton } from './admin-webhook-overview/LoadingSkeleton';
import { WebhookChartsSection } from './admin-webhook-overview/WebhookChartsSection';
import { WebhookMatrixTable } from './admin-webhook-overview/WebhookMatrixTable';
import { WebhookDetailTable } from './admin-webhook-overview/WebhookDetailTable';
import { useWebhookOverview, HARD_LIMIT } from './admin-webhook-overview/useWebhookOverview';

const RANGE_OPTIONS = [
  { value: '1', label: 'Última hora' },
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '168', label: 'Últimos 7 dias' },
] as const;

export default function AdminWebhookOverviewPage() {
  const {
    hours,
    setHours,
    instance,
    setInstance,
    includeUnprocessed,
    setIncludeUnprocessed,
    autoRefresh,
    setAutoRefresh,
    isLoading,
    isRefetching,
    refetch,
    error,
    byType,
    matrix,
    hourly,
    totals,
    allInstances,
    sampleSaturated,
  } = useWebhookOverview();

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Webhook className="h-6 w-6 text-primary" />
            Overview — Webhooks Evolution
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão consolidada de eventos por tipo e instância, com volume por hora e taxa de erro.
            Para drill-down evento-a-evento, use{' '}
            <span className="font-medium">Eventos do Webhook</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={instance} onValueChange={setInstance}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas instâncias</SelectItem>
              {allInstances.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={includeUnprocessed ? 'outline' : 'default'}
            size="sm"
            onClick={() => setIncludeUnprocessed((v) => !v)}
            title="Inclui eventos ainda não processados"
          >
            {includeUnprocessed ? 'Incluir pendentes' : 'Só processados'}
          </Button>
          <div
            className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5"
            title={
              autoRefresh
                ? 'Atualizando automaticamente a cada 60s'
                : 'Auto-refresh desligado — use Atualizar para recarregar'
            }
          >
            <Switch
              id="webhook-overview-auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Alternar atualização automática"
            />
            <Label
              htmlFor="webhook-overview-auto-refresh"
              className="cursor-pointer select-none text-xs"
            >
              Auto-refresh 60s
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </header>

      {sampleSaturated && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Mostrando os {HARD_LIMIT} eventos mais recentes da janela. Para volumes maiores, considere
          reduzir o período.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={Activity} label="Total no período" value={totals.total} tone="info" />
        <KpiCard icon={CheckCircle2} label="Processados" value={totals.processed} tone="success" />
        <KpiCard
          icon={XCircle}
          label="Com erro"
          value={`${totals.errored} (${totals.errorPct.toFixed(1)}%)`}
          tone={totals.errorPct > 5 ? 'destructive' : 'info'}
        />
        <KpiCard icon={Server} label="Instâncias ativas" value={totals.instances} tone="info" />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-destructive">
            Erro ao carregar: {(error as Error).message}
          </CardContent>
        </Card>
      ) : totals.total === 0 ? (
        <Card>
          <CardContent className="p-0">
            <GenericEmptyState
              icon={Webhook}
              title="Sem eventos no período"
              description="Nenhum evento de webhook foi recebido na janela e instância selecionadas. Verifique a configuração do webhook ou amplie o intervalo."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <WebhookChartsSection byType={byType} hourly={hourly} hours={hours} instance={instance} />
          <WebhookMatrixTable matrix={matrix} />
          <WebhookDetailTable byType={byType} />
        </>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Fonte: <code>evolution_webhook_events</code> (FATOR X) · Limite {HARD_LIMIT} registros ·
        Auto-refresh 60s
      </p>
    </div>
  );
}
