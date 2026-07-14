/**
 * Admin: Auditable log of evolution-webhook events.
 * Filters by event type, instance and date range. Reads from FATOR X
 * `evolution_webhook_events` via external-db-proxy.
 */
import {
  Webhook,
  RefreshCw,
  Inbox,
  CheckCircle2,
  XCircle,
  Filter,
  PhoneCall,
  List,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CallCorrelationView } from './admin-webhook-overview/CallCorrelationView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useWebhookEvents, type EventTypeFilter } from './admin-webhook-events/useWebhookEvents';
import { WebhookFiltersCard } from './admin-webhook-events/WebhookFiltersCard';
import { WebhookEventsTable } from './admin-webhook-events/WebhookEventsTable';

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: 'warning' | 'info' | 'destructive' | 'success';
}) {
  const toneClasses = {
    warning: 'text-warning',
    info: 'text-primary',
    destructive: 'text-destructive',
    success: 'text-success',
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <Icon className={cn('h-8 w-8 opacity-70', toneClasses)} />
      </CardContent>
    </Card>
  );
}

export default function AdminWebhookEventsPage() {
  const {
    hours,
    setHours,
    eventType,
    setEventType,
    instance,
    setInstance,
    messageType,
    setMessageType,
    status,
    setStatus,
    remoteJidFilter,
    setRemoteJidFilter,
    pushNameFilter,
    setPushNameFilter,
    search,
    setSearch,
    selected,
    setSelected,
    viewMode,
    setViewMode,
    isLoading,
    isRefetching,
    refetch,
    error,
    aggregates,
    filtered,
    clearFilters,
    hasActiveFilters,
  } = useWebhookEvents();

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Webhook className="h-6 w-6 text-primary" />
            Auditoria — Eventos do Evolution Webhook
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico auditável de todos os eventos recebidos pelo webhook (PRESENCE, CONTACTS,
            CHATS, CALL, LABELS, mensagens e conexão) por instância e período.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) =>
              v &&
              setViewMode(
                v as
                  | 'events'
                  | 'calls' /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
            size="sm"
          >
            <ToggleGroupItem value="events" aria-label="Lista de eventos">
              <List className="mr-1.5 h-4 w-4" />
              Eventos
            </ToggleGroupItem>
            <ToggleGroupItem value="calls" aria-label="Correlação por call">
              <PhoneCall className="mr-1.5 h-4 w-4" />
              Por Call
            </ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={Inbox} label="Total no período" value={aggregates.total} tone="info" />
        <KpiCard
          icon={CheckCircle2}
          label="Processados"
          value={aggregates.processed}
          tone="success"
        />
        <KpiCard icon={XCircle} label="Com erro" value={aggregates.errored} tone="destructive" />
        <KpiCard
          icon={Filter}
          label="Tipos distintos"
          value={aggregates.types.length}
          tone="info"
        />
      </div>

      <WebhookFiltersCard
        hours={hours}
        setHours={setHours}
        eventType={eventType}
        setEventType={setEventType}
        instance={instance}
        setInstance={setInstance}
        messageType={messageType}
        setMessageType={setMessageType}
        status={status}
        setStatus={setStatus}
        remoteJidFilter={remoteJidFilter}
        setRemoteJidFilter={setRemoteJidFilter}
        pushNameFilter={pushNameFilter}
        setPushNameFilter={setPushNameFilter}
        search={search}
        setSearch={setSearch}
        instances={aggregates.instances}
        hasActiveFilters={hasActiveFilters}
        clearFilters={clearFilters}
      />

      {/* Type breakdown chips — only in list view */}
      {viewMode === 'events' && aggregates.types.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {aggregates.types.map(([type, count]) => (
            <Badge
              key={type}
              variant={eventType === type ? 'default' : 'outline'}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-pressed={eventType === type}
              onClick={() => setEventType(eventType === type ? 'all' : (type as EventTypeFilter))}
              onKeyDown={(e) =>
                (e.key === 'Enter' || e.key === ' ') &&
                setEventType(eventType === type ? 'all' : (type as EventTypeFilter))
              }
            >
              {type} · {count}
            </Badge>
          ))}
        </div>
      )}

      {viewMode === 'calls' && <CallCorrelationView events={filtered} />}

      {viewMode === 'events' && (
        <WebhookEventsTable
          filtered={filtered}
          isLoading={isLoading}
          error={error}
          total={aggregates.total}
          selected={selected}
          setSelected={setSelected}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">
        Fonte: <code>evolution_webhook_events</code> (FATOR X) · Limite 200 registros por consulta ·
        Auto-refresh a cada 60s
      </p>
    </div>
  );
}
