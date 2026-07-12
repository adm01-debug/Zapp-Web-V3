import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recheckWebhookSignature, type RecheckResult } from '@/lib/recheckWebhookSignature';
import { RecheckResultDialog } from './admin-webhook-secret-status/RecheckResultDialog';
import { supabase } from '@/integrations/supabase/client';
import { queryExternalProxy } from '@/lib/externalProxy';
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
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { InstanceFilterSelect } from './admin-webhook-secret-status/InstanceFilterSelect';
import { InstanceStatusCards } from './admin-webhook-secret-status/InstanceStatusCards';
import { InstanceBreakdownTable } from './admin-webhook-secret-status/InstanceBreakdownTable';
import { AlertThresholdsPanel } from './admin-webhook-secret-status/AlertThresholdsPanel';
import { WebhookAlertHistoryPanel } from './admin-webhook-secret-status/WebhookAlertHistoryPanel';
import { AdvancedFiltersPanel } from './admin-webhook-secret-status/AdvancedFiltersPanel';
import { HmacSelfTestButton } from './admin-webhook-secret-status/HmacSelfTestButton';
import { HmacAuditHistoryPanel } from './admin-webhook-secret-status/HmacAuditHistoryPanel';
import { useWebhookHealthAlerts } from '@/hooks/useWebhookHealthAlerts';
import { useWebhookViewPreferences } from '@/hooks/useWebhookViewPreferences';
import {
  aggregateValidationByInstance,
  computeInstanceStatus,
  computeLatencyStats,
  deriveInstances,
  type SecretStatusEvent,
} from './admin-webhook-secret-status/instanceAggregations';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

interface SecretStatus {
  configured: boolean;
  length: number;
  hashPrefix: string | null;
  strictMode: boolean;
  checkedAt: string;
}

const REFRESH_INTERVAL = 30_000;

export default function AdminWebhookSecretStatusPage() {
  const { filters, setFilters } = useUrlFilters();
  // Reuse `agentId` slot for instance — but better: use raw URL via setFilters extension.
  // We'll piggy-back on a custom param via setSearchParams below.
  const instance = (filters as { instance?: string | null }).instance ?? null;
  // useUrlFilters doesn't natively expose `instance`; we use a dedicated query param.
  const selectedInstance = useMemo<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('instance');
  }, [filters]); // refresh when other filters change too
  void instance;

  const setInstance = useCallback((next: string | null) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('instance', next);
    else url.searchParams.delete('instance');
    window.history.replaceState({}, '', url.toString());
    // Force re-render by touching useUrlFilters
    setFilters({ search: filters.search });
  }, [filters.search, setFilters]);

  // 1. Secret status (no value exposed)
  const secretQuery = useQuery({
    queryKey: ['webhook-secret-status'],
    queryFn: async (): Promise<SecretStatus> => {
      const { data, error } = await supabase.functions.invoke('webhook-secret-status');
      if (error) throw error;
      return data as SecretStatus;
    },
    refetchInterval: REFRESH_INTERVAL,
  });

  // 2. Recent webhook events — last 24h. Server-side filter by instance when set.
  const eventsQuery = useQuery({
    queryKey: ['webhook-recent-events', selectedInstance],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const filtersArr = [
        { column: 'created_at', operator: 'gte', value: since },
      ];
      if (selectedInstance) {
        filtersArr.push({ column: 'instance_name', operator: 'eq', value: selectedInstance });
      }
      const res = await queryExternalProxy<SecretStatusEvent>({
        table: 'evolution_webhook_events',
        select:
          'id,event_type,instance_name,signature_valid,processed,processed_at,error_message,created_at',
        filters: filtersArr,
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });
      return res.data ?? [];
    },
    refetchInterval: REFRESH_INTERVAL,
  });

  // 3. Always fetch a small global slice for the instance dropdown so the user can
  //    switch even if currently filtered to an instance with no traffic.
  const instancesQuery = useQuery({
    queryKey: ['webhook-instances-list'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const res = await queryExternalProxy<{ instance_name: string | null }>({
        table: 'evolution_webhook_events',
        select: 'instance_name',
        filters: [{ column: 'created_at', operator: 'gte', value: since }],
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });
      return res.data ?? [];
    },
    refetchInterval: REFRESH_INTERVAL * 4,
  });

  const refetchAll = () => {
    secretQuery.refetch();
    eventsQuery.refetch();
    instancesQuery.refetch();
  };

  const events = eventsQuery.data ?? [];
  const lastEvent = events[0];
  const total24h = events.length;
  const validSigned = events.filter((e) => e.signature_valid === true).length;
  const invalidSigned = events.filter((e) => e.signature_valid === false).length;
  const unsigned = events.filter((e) => e.signature_valid === null).length;
  const errored = events.filter((e) => e.error_message).length;
  const validationRate = total24h > 0 ? Math.round((validSigned / total24h) * 100) : 0;

  const instances = useMemo(() => {
    const fromList = deriveInstances(
      (instancesQuery.data ?? []).map((r) => ({
        event_type: '',
        instance_name: r.instance_name,
        signature_valid: null,
        processed: null,
        processed_at: null,
        error_message: null,
        created_at: '',
      })),
    );
    // Always include current selection so it stays selectable when filtered.
    if (selectedInstance && !fromList.includes(selectedInstance)) fromList.push(selectedInstance);
    return fromList.sort();
  }, [instancesQuery.data, selectedInstance]);

  // Live status / latency for the selected instance (or global).
  const liveStatus = useMemo(
    () => computeInstanceStatus(events, selectedInstance),
    [events, selectedInstance],
  );
  const latency = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return computeLatencyStats(events.filter((e) => new Date(e.created_at).getTime() >= oneHourAgo));
  }, [events]);

  // Per-instance breakdown only relevant when no instance selected.
  const breakdown = useMemo(() => aggregateValidationByInstance(events), [events]);

  const secret = secretQuery.data;
  const enabled = (secret?.configured ?? false) || total24h > 0;
  const scopeLabel = selectedInstance ?? 'todas';

  // Realtime alerts hook — partilha config/state com o painel.
  const {
    config: alertConfig,
    setConfig: setAlertConfig,
    activeBreaches,
    recentAlerts,
    history: alertHistory,
    reloadHistory,
  } = useWebhookHealthAlerts();

  // View preferences (status/reason/event-type/density/columns/pinned instance)
  const {
    prefs,
    setPref,
    setVisibleColumn,
    clearFilters: clearAdvancedFilters,
    resetPrefs,
    activeFilterCount,
  } = useWebhookViewPreferences();

  // Clears advanced filters AND removes all query params from the URL
  // (instance, q, status, etc.). Pinned instance stays in prefs but is
  // not auto-reapplied because pinnedAppliedRef is already true post-mount.
  const clearAllFiltersAndUrl = useCallback(() => {
    clearAdvancedFilters();
    const url = new URL(window.location.href);
    // Wipe every search param (keep pathname + hash intact).
    url.search = '';
    window.history.replaceState({}, '', url.toString());
    // Force useUrlFilters to re-read so derived state updates.
    setFilters({ search: '' });
  }, [clearAdvancedFilters, setFilters]);

  // Restores ALL view preferences to factory defaults AND wipes the URL,
  // including the pinned instance — so reopening the page starts blank.
  const resetAllPrefsAndUrl = useCallback(() => {
    resetPrefs();
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
    setFilters({ search: '' });
  }, [resetPrefs, setFilters]);

  // Auto-apply pinned instance once on mount, only if URL has no instance set.
  const pinnedAppliedRef = useRef(false);
  useEffect(() => {
    if (pinnedAppliedRef.current) return;
    pinnedAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('instance') && prefs.pinnedInstance) {
      setInstance(prefs.pinnedInstance);
    }
  }, [prefs.pinnedInstance, setInstance]);

  // Available event types from current dataset.
  const availableEventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.event_type) set.add(e.event_type);
    return Array.from(set).sort();
  }, [events]);

  // Apply advanced filters to events table only (not aggregated cards).
  const filteredEvents = useMemo(() => {
    const reason = prefs.reasonSearch.trim().toLowerCase();
    return events.filter((e) => {
      if (prefs.statusFilter === 'valid' && e.signature_valid !== true) return false;
      if (prefs.statusFilter === 'invalid' && e.signature_valid !== false) return false;
      if (prefs.statusFilter === 'unsigned' && e.signature_valid !== null) return false;
      if (prefs.statusFilter === 'errored' && !e.error_message) return false;
      if (prefs.eventTypeFilter && e.event_type !== prefs.eventTypeFilter) return false;
      if (reason && !(e.error_message ?? '').toLowerCase().includes(reason)) return false;
      return true;
    });
  }, [events, prefs.statusFilter, prefs.eventTypeFilter, prefs.reasonSearch]);

  // Recheck dialog state
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  const handleRecheck = async (eventId: string) => {
    setRecheckingId(eventId);
    setRecheckOpen(true);
    setRecheckLoading(true);
    setRecheckResult(null);
    setRecheckError(null);
    try {
      const res = await recheckWebhookSignature(eventId);
      setRecheckResult(res);
      if (res.signature_valid === true) toast.success('Assinatura válida');
      else if (res.signature_valid === false) toast.error('Assinatura inválida');
      else toast.message('Revalidação inconclusiva');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao revalidar';
      setRecheckError(msg);
      toast.error(msg);
    } finally {
      setRecheckLoading(false);
      setRecheckingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6 text-primary" />
            Status do Webhook & Secret
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento do <code>WEBHOOK_SECRET</code> e da saúde do recebimento — sem expor o valor.
            Escopo atual: <span className="font-medium text-foreground">{scopeLabel}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeBreaches.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              {activeBreaches.length} alerta{activeBreaches.length > 1 ? 's' : ''} ativo{activeBreaches.length > 1 ? 's' : ''}
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
              to={`/admin/hmac-selftest?instance=${encodeURIComponent(selectedInstance ?? DEFAULT_WHATSAPP_INSTANCE)}`}
              aria-label="Abrir página do HMAC self-test"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
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
              className={`h-4 w-4 mr-2 ${
                secretQuery.isFetching || eventsQuery.isFetching ? 'animate-spin' : ''
              }`}
            />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Live instance status (above HMAC section) */}
      <InstanceStatusCards
        instance={selectedInstance}
        status={liveStatus}
        latency={latency}
        isLoading={eventsQuery.isLoading}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Secret card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
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
                <div className="text-xs text-muted-foreground mt-2 ">
                  {secret.length} chars · #{secret.hashPrefix}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <Badge variant="destructive">Ausente</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-2">Modo não-strict ativo</div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Webhook enabled */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
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
                <div className="text-xs text-muted-foreground mt-2">
                  {total24h} eventos / 24h ({scopeLabel})
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Last received */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
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
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {lastEvent.event_type}
                  {lastEvent.instance_name ? ` · ${lastEvent.instance_name}` : ''}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum evento</div>
            )}
          </CardContent>
        </Card>

        {/* Signature validation rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
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
                <div className="text-xs text-muted-foreground mt-1">
                  {validSigned} válidas · {invalidSigned} inválidas · {unsigned} sem
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico de execuções do botão "Testar HMAC" */}
      <HmacAuditHistoryPanel instance={selectedInstance} />

      {/* Per-instance breakdown — only when filter = "all" */}
      {!selectedInstance && (
        <InstanceBreakdownTable stats={breakdown} onSelectInstance={setInstance} />
      )}

      {/* Alerts */}
      {!secret?.configured && (
        <Alert variant="default" className="border-warning/40 bg-warning/5">
          <ShieldAlert className="h-4 w-4 text-warning" />
          <AlertTitle>Secret não configurado</AlertTitle>
          <AlertDescription>
            O <code>WEBHOOK_SECRET</code> não está definido. Webhooks são aceitos sem validação HMAC
            (modo não-strict). Configure o secret nas variáveis de ambiente da Lovable Cloud para ativar
            a validação criptográfica.
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

      {/* Detail card — verification metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadados da validação</CardTitle>
          <CardDescription>Informações coletadas sem exposição do segredo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
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

      {/* Advanced filters & view preferences */}
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
          <CardTitle className="text-base flex items-center gap-2">
            Últimos eventos recebidos — {scopeLabel}
            {activeFilterCount > 0 && (
              <Badge variant="secondary">
                {filteredEvents.length} de {events.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Top 20 eventos das últimas 24 horas — atualiza a cada 30s.</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum webhook recebido nas últimas 24h.
            </p>
          ) : filteredEvents.length === 0 ? (
            <div className="py-8 text-center space-y-3">
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
                    {prefs.visibleColumns.when && <th scope="col" className="py-2 pr-4">Quando</th>}
                    {prefs.visibleColumns.event && <th scope="col" className="py-2 pr-4">Evento</th>}
                    {prefs.visibleColumns.instance && <th scope="col" className="py-2 pr-4">Instância</th>}
                    {prefs.visibleColumns.signature && <th scope="col" className="py-2 pr-4">Assinatura</th>}
                    {prefs.visibleColumns.status && <th scope="col" className="py-2 pr-4">Status</th>}
                    {prefs.visibleColumns.action && <th scope="col" className="py-2 pr-4 text-right">Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.slice(0, 20).map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      {prefs.visibleColumns.when && (
                        <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                          {formatDistanceToNow(new Date(e.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </td>
                      )}
                      {prefs.visibleColumns.event && (
                        <td className="py-2 pr-4  text-xs">{e.event_type}</td>
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

      {/* Realtime alerts configuration */}
      <AlertThresholdsPanel
        config={alertConfig}
        onChange={setAlertConfig}
        recentAlerts={recentAlerts}
        activeCount={activeBreaches.length}
      />

      {/* Persistent alert history (audit) */}
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
