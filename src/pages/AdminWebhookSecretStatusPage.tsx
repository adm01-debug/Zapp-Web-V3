import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, Webhook, RefreshCw, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RecheckResultDialog } from './admin-webhook-secret-status/RecheckResultDialog';
import { InstanceFilterSelect } from './admin-webhook-secret-status/InstanceFilterSelect';
import { InstanceStatusCards } from './admin-webhook-secret-status/InstanceStatusCards';
import { InstanceBreakdownTable } from './admin-webhook-secret-status/InstanceBreakdownTable';
import { AlertThresholdsPanel } from './admin-webhook-secret-status/AlertThresholdsPanel';
import { WebhookAlertHistoryPanel } from './admin-webhook-secret-status/WebhookAlertHistoryPanel';
import { AdvancedFiltersPanel } from './admin-webhook-secret-status/AdvancedFiltersPanel';
import { HmacSelfTestButton } from './admin-webhook-secret-status/HmacSelfTestButton';
import { HmacAuditHistoryPanel } from './admin-webhook-secret-status/HmacAuditHistoryPanel';
import { WebhookKpiCards } from './admin-webhook-secret-status/WebhookKpiCards';
import { WebhookEventsTable } from './admin-webhook-secret-status/WebhookEventsTable';
import { WebhookValidationMetaCard } from './admin-webhook-secret-status/WebhookValidationMetaCard';
import { useAdminWebhookStatus } from './admin-webhook-secret-status/useAdminWebhookStatus';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

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

      <InstanceStatusCards
        instance={selectedInstance}
        status={liveStatus}
        latency={latency}
        isLoading={eventsQuery.isLoading}
      />

      <WebhookKpiCards
        secret={secret}
        enabled={enabled}
        total24h={total24h}
        scopeLabel={scopeLabel}
        lastEvent={lastEvent}
        validationRate={validationRate}
        validSigned={validSigned}
        invalidSigned={invalidSigned}
        unsigned={unsigned}
        secretLoading={secretQuery.isLoading}
        eventsLoading={eventsQuery.isLoading}
      />

      <SectionErrorBoundary sectionName="Histórico de auditoria HMAC">
        <HmacAuditHistoryPanel instance={selectedInstance} />
      </SectionErrorBoundary>

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

      <WebhookValidationMetaCard secret={secret} unsigned={unsigned} errored={errored} />

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

      <WebhookEventsTable
        scopeLabel={scopeLabel}
        events={events}
        filteredEvents={filteredEvents}
        eventsLoading={eventsQuery.isLoading}
        prefs={prefs}
        activeFilterCount={activeFilterCount}
        recheckingId={recheckingId}
        handleRecheck={handleRecheck}
        clearAllFiltersAndUrl={clearAllFiltersAndUrl}
      />

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