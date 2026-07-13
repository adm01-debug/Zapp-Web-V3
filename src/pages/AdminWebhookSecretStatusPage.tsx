import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck,
  ShieldAlert,
  Webhook,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  KeyRound,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RecheckResultDialog } from './admin-webhook-secret-status/RecheckResultDialog';
import { InstanceFilterSelect } from './admin-webhook-secret-status/InstanceFilterSelect';
import { InstanceStatusCards } from './admin-webhook-secret-status/InstanceStatusCards';
import { InstanceBreakdownTable } from './admin-webhook-secret-status/InstanceBreakdownTable';
import { AlertThresholdsPanel } from './admin-webhook-secret-status/AlertThresholdsPanel';
import { WebhookAlertHistoryPanel } from './admin-webhook-secret-status/WebhookAlertHistoryPanel';
import { AdvancedFiltersPanel } from './admin-webhook-secret-status/AdvancedFiltersPanel';
import { HmacSelfTestButton } from './admin-webhook-secret-status/HmacSelfTestButton';
import { HmacAuditHistoryPanel } from './admin-webhook-secret-status/HmacAuditHistoryPanel';
import { useAdminWebhookStatus } from './admin-webhook-secret-status/useAdminWebhookStatus';

export default function AdminWebhookSecretStatusPage() {
  const {
    selectedInstance,
    setInstance,
    instances,
    defaultInstance,
    scopeLabel,
    secretQuery,
    eventsQuery,
    instancesQuery,
    refetchAll,
    secret,
    enabled,
    events,
    lastEvent,
    total24h,
    validSigned,
    invalidSigned,
    unsigned,
    errored,
    validationRate,
    liveStatus,
    latency,
    breakdown,
    filteredEvents,
    availableEventTypes,
    prefs,
    setPref,
    setVisibleColumn,
    activeFilterCount,
    clearAllFiltersAndUrl,
    resetAllPrefsAndUrl,
    alertConfig,
    setAlertConfig,
    activeBreaches,
    recentAlerts,
    alertHistory,
    reloadHistory,
    recheckOpen,
    setRecheckOpen,
    recheckLoading,
    recheckResult,
    recheckError,
    recheckingId,
    handleRecheck,
  } = useAdminWebhookStatus();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Webhook className="h-6 w-6 text-primary" />
            Status do Webhook & Secret
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitoramento do <code>WEBHOOK_SECRET</code> e da saúde do recebimento — sem expor o
            valor. Escopo atual: <span className="font-medium text-foreground">{scopeLabel}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeBreaches.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              {activeBreaches.length} alerta{activeBreaches.length > 1 ? 's' : ''} ativo
              {activeBreaches.length > 1 ? 's' : ''}
            </Badge>
          )}
          <InstanceFilterSelect
            instances={instances}
            value={selectedInstance}
            onChange={setInstance}
            disabled={instancesQuery.isLoading}
          />
          <HmacSelfTestButton instance={selectedInstance} />
          <Button variant="ghost" size="sm" asChild data-testid="hmac-selftest-open-page">
            <Link
              to={`/admin/hmac-selftest?instance=${encodeURIComponent(selectedInstance ?? defaultInstance)}`}
              aria-label="Abrir página do HMAC self-test"
            >
              <ExternalLink className="mr-1 h-4 w-4" />
              Abrir página
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            disabled={secretQuery.isFetching || eventsQuery.isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${
                secretQuery.isFetching || eventsQuery.isFetching ? 'animate-spin' : ''
              }`}
            />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Live instance status */}
      <InstanceStatusCards
        instance={selectedInstance}
        status={liveStatus}
        latency={latency}
        isLoading={eventsQuery.isLoading}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4" />
              WEBHOOK_SECRET
            </CardTitle>
          </CardHeader>
          <CardContent>
            {secretQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : secret?.configured ? (
              <>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-success" />
                  <Badge variant="success">Configurado</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {secret.length} chars · #{secret.hashPrefix}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <Badge variant="destructive">Ausente</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Modo não-strict ativo</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4" />
              Webhook
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {enabled ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <Badge variant={enabled ? 'success' : 'subtle'}>
                    {enabled ? 'Habilitado' : 'Inativo'}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {total24h} eventos / 24h ({scopeLabel})
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              Último recebimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : lastEvent ? (
              <>
                <div className="text-lg font-semibold">
                  {formatDistanceToNow(new Date(lastEvent.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {lastEvent.event_type}
                  {lastEvent.instance_name ? ` · ${lastEvent.instance_name}` : ''}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum evento</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" />
              Assinatura validada — {scopeLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {validationRate}
                  <span className="text-base text-muted-foreground">%</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {validSigned} válidas · {invalidSigned} inválidas · {unsigned} sem
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <HmacAuditHistoryPanel instance={selectedInstance} />

      {!selectedInstance && (
        <InstanceBreakdownTable stats={breakdown} onSelectInstance={setInstance} />
      )}

      {!secret?.configured && (
        <Alert variant="default" className="border-warning/40 bg-warning/5">
          <ShieldAlert className="h-4 w-4 text-warning" />
          <AlertTitle>Secret não configurado</AlertTitle>
          <AlertDescription>
            O <code>WEBHOOK_SECRET</code> não está definido. Webhooks são aceitos sem validação HMAC
            (modo não-strict). Configure o secret nas variáveis de ambiente da Lovable Cloud para
            ativar a validação criptográfica.
          </AlertDescription>
        </Alert>
      )}

      {invalidSigned > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Assinaturas inválidas detectadas — {scopeLabel}</AlertTitle>
          <AlertDescription>
            {invalidSigned} requisições nas últimas 24h falharam na validação HMAC. Verifique se o
            secret é idêntico na Evolution API.
          </AlertDescription>
        </Alert>
      )}

      {/* Validation metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadados da validação</CardTitle>
          <CardDescription>Informações coletadas sem exposição do segredo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Modo strict</span>
              <span className="font-medium">
                {secret?.strictMode ? (
                  <Badge variant="success">Ativo</Badge>
                ) : (
                  <Badge variant="subtle">Inativo</Badge>
                )}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Tamanho do secret</span>
              <span className="">{secret?.length ?? 0} caracteres</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Hash prefix (SHA-256)</span>
              <span className="">{secret?.hashPrefix ? `${secret.hashPrefix}…` : '—'}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Último check</span>
              <span>
                {secret?.checkedAt
                  ? formatDistanceToNow(new Date(secret.checkedAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Eventos sem assinatura</span>
              <span className="">{unsigned}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Eventos com erro</span>
              <span className="">{errored}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <AdvancedFiltersPanel
        prefs={prefs}
        setPref={setPref}
        setVisibleColumn={setVisibleColumn}
        clearFilters={clearAllFiltersAndUrl}
        resetPrefs={resetAllPrefsAndUrl}
        activeFilterCount={activeFilterCount}
        availableEventTypes={availableEventTypes}
        currentInstance={selectedInstance}
        onClearInstance={() => setInstance(null)}
      />

      {/* Recent events table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Últimos eventos recebidos — {scopeLabel}
            {activeFilterCount > 0 && (
              <Badge variant="secondary">
                {filteredEvents.length} de {events.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Top 20 eventos das últimas 24 horas — atualiza a cada 30s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum webhook recebido nas últimas 24h.
            </p>
          ) : filteredEvents.length === 0 ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum evento corresponde aos filtros atuais.
              </p>
              <Button variant="outline" size="sm" onClick={clearAllFiltersAndUrl}>
                Limpar filtros
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className={`w-full text-sm ${
                  prefs.tableDensity === 'compact' ? '[&_td]:py-1 [&_th]:py-1' : ''
                }`}
              >
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    {prefs.visibleColumns.when && (
                      <th scope="col" className="py-2 pr-4">
                        Quando
                      </th>
                    )}
                    {prefs.visibleColumns.event && (
                      <th scope="col" className="py-2 pr-4">
                        Evento
                      </th>
                    )}
                    {prefs.visibleColumns.instance && (
                      <th scope="col" className="py-2 pr-4">
                        Instância
                      </th>
                    )}
                    {prefs.visibleColumns.signature && (
                      <th scope="col" className="py-2 pr-4">
                        Assinatura
                      </th>
                    )}
                    {prefs.visibleColumns.status && (
                      <th scope="col" className="py-2 pr-4">
                        Status
                      </th>
                    )}
                    {prefs.visibleColumns.action && (
                      <th scope="col" className="py-2 pr-4 text-right">
                        Ação
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.slice(0, 20).map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      {prefs.visibleColumns.when && (
                        <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                          {formatDistanceToNow(new Date(e.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </td>
                      )}
                      {prefs.visibleColumns.event && (
                        <td className="py-2 pr-4 text-xs">{e.event_type}</td>
                      )}
                      {prefs.visibleColumns.instance && (
                        <td className="py-2 pr-4 text-xs">{e.instance_name ?? '—'}</td>
                      )}
                      {prefs.visibleColumns.signature && (
                        <td className="py-2 pr-4">
                          {e.signature_valid === true ? (
                            <Badge variant="success">válida</Badge>
                          ) : e.signature_valid === false ? (
                            <Badge variant="destructive">inválida</Badge>
                          ) : (
                            <Badge variant="subtle">—</Badge>
                          )}
                        </td>
                      )}
                      {prefs.visibleColumns.status && (
                        <td className="py-2 pr-4">
                          {e.error_message ? (
                            <Badge variant="destructive">erro</Badge>
                          ) : e.processed ? (
                            <Badge variant="success">ok</Badge>
                          ) : (
                            <Badge variant="subtle">pendente</Badge>
                          )}
                        </td>
                      )}
                      {prefs.visibleColumns.action && (
                        <td className="py-2 pr-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={recheckingId === e.id}
                            onClick={() => handleRecheck(e.id ?? '')}
                            aria-label="Revalidar assinatura"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${recheckingId === e.id ? 'animate-spin' : ''}`}
                            />
                            <span className="ml-1 text-xs">Revalidar</span>
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertThresholdsPanel
        config={alertConfig}
        onChange={setAlertConfig}
        recentAlerts={recentAlerts}
        activeCount={activeBreaches.length}
      />

      <WebhookAlertHistoryPanel history={alertHistory} onCleared={reloadHistory} />

      <RecheckResultDialog
        open={recheckOpen}
        onOpenChange={setRecheckOpen}
        loading={recheckLoading}
        result={recheckResult}
        error={recheckError}
      />
    </div>
  );
}
