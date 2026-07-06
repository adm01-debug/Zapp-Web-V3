/**
 * Admin: Auditable log of evolution-webhook events.
 * Filters by event type, instance and date range. Reads from FATOR X
 * `evolution_webhook_events` via external-db-proxy.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Webhook, RefreshCw, Inbox, CheckCircle2, XCircle,
  Eye, Filter, PhoneCall, List,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CallCorrelationView } from './admin-webhook-overview/CallCorrelationView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { queryExternalProxy } from '@/lib/externalProxy';
import { consumePendingWebhookEventsFilters } from '@/lib/webhookEventsDeepLink';
import { cn } from '@/lib/utils';
import type { EvolutionWebhookEvent } from '@/types/evolutionExternal';
import { formatDateTimeCompact } from '@/lib/formatters';

const EVENT_TYPES = [
  'all',
  'PRESENCE_UPDATE',
  'CONTACTS_UPDATE',
  'CHATS_UPDATE',
  'CALL',
  'LABELS_ASSOCIATION',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
] as const;

type EventTypeFilter = typeof EVENT_TYPES[number];

// Tipos de mensagem mais comuns recebidos pela Evolution. `all` desliga o filtro.
const MESSAGE_TYPES = [
  'all', 'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage',
  'audioMessage', 'documentMessage', 'stickerMessage', 'locationMessage',
  'contactMessage', 'reactionMessage', 'pollCreationMessage', 'protocolMessage',
] as const;
type MessageTypeFilter = typeof MESSAGE_TYPES[number];

// Status agregado (independe do filtro textual livre).
const STATUS_OPTIONS = [
  { value: 'all',       label: 'Todos' },
  { value: 'processed', label: 'Processados' },
  { value: 'pending',   label: 'Pendentes' },
  { value: 'error',     label: 'Com erro' },
] as const;
type StatusFilter = typeof STATUS_OPTIONS[number]['value'];

const RANGE_OPTIONS = [
  { value: '1', label: 'Última hora' },
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '72', label: 'Últimos 3 dias' },
  { value: '168', label: 'Últimos 7 dias' },
  { value: '720', label: 'Últimos 30 dias' },
] as const;


function shortJid(jid: string | null) {
  if (!jid) return '—';
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', ' (grupo)');
}

export default function AdminWebhookEventsPage() {
  // Drill-down do AdminWebhookOverviewPage: aplica filtros iniciais (uma vez)
  // a partir do sessionStorage. Validamos contra a lista de tipos conhecidos
  // para nunca aceitar input "envenenado".
  const initialFilters = useMemo(() => {
    const pending = consumePendingWebhookEventsFilters();
    if (!pending) return null;
    const eventType =
      pending.eventType && (EVENT_TYPES as readonly string[]).includes(pending.eventType)
        ? (pending.eventType as EventTypeFilter)
        : undefined;
    const instance = pending.instance && pending.instance.trim() ? pending.instance : undefined;
    return { eventType, instance };
  }, []);

  const [hours, setHours] = useState<string>('24');
  const [eventType, setEventType] = useState<EventTypeFilter>(initialFilters?.eventType ?? 'all');
  const [instance, setInstance] = useState<string>(initialFilters?.instance ?? 'all');
  const [messageType, setMessageType] = useState<MessageTypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [remoteJidFilter, setRemoteJidFilter] = useState('');
  const [pushNameFilter, setPushNameFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EvolutionWebhookEvent | null>(null);
  const [viewMode, setViewMode] = useState<'events' | 'calls'>('events');

  const sinceISO = useMemo(
    () => subHours(new Date(), Number(hours)).toISOString(),
    [hours],
  );

  // ── Fetch events ──────────────────────────────────────────────
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: [
      'admin-webhook-events', hours, eventType, instance, messageType, status,
      remoteJidFilter.trim().toLowerCase(), pushNameFilter.trim().toLowerCase(),
    ],
    queryFn: async () => {
      const filters: { column: string; operator: string; value: unknown }[] = [
        { column: 'created_at', operator: 'gte', value: sinceISO },
      ];
      if (eventType !== 'all') filters.push({ column: 'event_type', operator: 'eq', value: eventType });
      if (instance !== 'all') filters.push({ column: 'instance_name', operator: 'eq', value: instance });
      if (messageType !== 'all') filters.push({ column: 'message_type', operator: 'eq', value: messageType });

      // Status agregado — independe do search textual.
      if (status === 'processed') {
        filters.push({ column: 'processed', operator: 'eq', value: true });
        filters.push({ column: 'error_message', operator: 'is', value: null });
      } else if (status === 'pending') {
        filters.push({ column: 'processed', operator: 'eq', value: false });
        filters.push({ column: 'error_message', operator: 'is', value: null });
      } else if (status === 'error') {
        filters.push({ column: 'error_message', operator: 'not.is', value: null });
      }

      const jid = remoteJidFilter.trim();
      if (jid) filters.push({ column: 'remote_jid', operator: 'ilike', value: `%${jid}%` });
      const name = pushNameFilter.trim();
      if (name) filters.push({ column: 'push_name', operator: 'ilike', value: `%${name}%` });

      const res = await queryExternalProxy<EvolutionWebhookEvent>({
        table: 'evolution_webhook_events',
        select: '*',
        filters,
        order: { column: 'created_at', ascending: false },
        limit: 200,
      });
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // ── Aggregates ────────────────────────────────────────────────
  const aggregates = useMemo(() => {
    const rows = data ?? [];
    const byType: Record<string, number> = {};
    const byInstance = new Set<string>();
    let processed = 0;
    let errored = 0;
    for (const r of rows) {
      byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
      byInstance.add(r.instance_name);
      if (r.processed) processed++;
      if (r.error_message) errored++;
    }
    return {
      total: rows.length,
      processed,
      errored,
      types: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      instances: Array.from(byInstance).sort(),
    };
  }, [data]);

  // ── Client-side text filter ───────────────────────────────────
  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.remote_jid?.toLowerCase().includes(q) ||
        r.push_name?.toLowerCase().includes(q) ||
        r.event_type.toLowerCase().includes(q) ||
        r.error_message?.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6 text-primary" />
            Auditoria — Eventos do Evolution Webhook
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico auditável de todos os eventos recebidos pelo webhook (PRESENCE, CONTACTS,
            CHATS, CALL, LABELS, mensagens e conexão) por instância e período.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'events' | 'calls')}
            size="sm"
          >
            <ToggleGroupItem value="events" aria-label="Lista de eventos">
              <List className="h-4 w-4 mr-1.5" />
              Eventos
            </ToggleGroupItem>
            <ToggleGroupItem value="calls" aria-label="Correlação por call">
              <PhoneCall className="h-4 w-4 mr-1.5" />
              Por Call
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefetching && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Inbox} label="Total no período" value={aggregates.total} tone="info" />
        <KpiCard icon={CheckCircle2} label="Processados" value={aggregates.processed} tone="success" />
        <KpiCard icon={XCircle} label="Com erro" value={aggregates.errored} tone="destructive" />
        <KpiCard icon={Filter} label="Tipos distintos" value={aggregates.types.length} tone="info" />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <FilterField label="Janela">
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Tipo de evento">
            <Select value={eventType} onValueChange={(v) => setEventType(v as EventTypeFilter)}>
              <SelectTrigger className="w-[220px]" data-testid="filter-webhook-event-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t === 'all' ? 'Todos' : t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Instância">
            <Select value={instance} onValueChange={setInstance}>
              <SelectTrigger className="w-[160px]" data-testid="filter-webhook-instance"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {aggregates.instances.map((i) => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Tipo de mensagem">
            <Select value={messageType} onValueChange={(v) => setMessageType(v as MessageTypeFilter)}>
              <SelectTrigger className="w-[200px]" data-testid="filter-webhook-message-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESSAGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t === 'all' ? 'Todos' : t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[160px]" data-testid="filter-webhook-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Remote JID">
            <Input
              value={remoteJidFilter}
              onChange={(e) => setRemoteJidFilter(e.target.value)}
              placeholder="Ex: 5511999"
              className="w-[200px] "
              data-testid="filter-webhook-remote-jid"
            />
          </FilterField>

          <FilterField label="Push name">
            <Input
              value={pushNameFilter}
              onChange={(e) => setPushNameFilter(e.target.value)}
              placeholder="Ex: João"
              className="w-[200px]"
              data-testid="filter-webhook-push-name"
            />
          </FilterField>

          <FilterField label="Refinar (texto livre)">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtra resultado já carregado"
              className="w-[240px]"
              data-testid="filter-webhook-search"
            />
          </FilterField>

          {(remoteJidFilter || pushNameFilter || messageType !== 'all' || status !== 'all' || search) && (
            <FilterField label=" ">
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                data-testid="filter-webhook-clear"
                onClick={() => {
                  setRemoteJidFilter('');
                  setPushNameFilter('');
                  setMessageType('all');
                  setStatus('all');
                  setSearch('');
                }}
              >
                Limpar filtros
              </Button>
            </FilterField>
          )}
        </CardContent>
      </Card>

      {/* Type breakdown (chips) — só faz sentido na visão lista */}
      {viewMode === 'events' && aggregates.types.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {aggregates.types.map(([type, count]) => (
            <Badge
              key={type}
              variant={eventType === type ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setEventType(eventType === type ? 'all' : (type as EventTypeFilter))}
            >
              {type} · {count}
            </Badge>
          ))}
        </div>
      )}

      {viewMode === 'calls' && <CallCorrelationView events={filtered} />}

      {/* Table */}
      {viewMode === 'events' && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-medium flex items-center gap-2"
            data-testid="webhook-events-results-count"
            data-results-count={filtered.length}
          >
            <Inbox className="h-4 w-4" />
            {filtered.length} evento{filtered.length === 1 ? '' : 's'}
            {filtered.length !== aggregates.total && (
              <span className="text-muted-foreground font-normal">
                {' '}(de {aggregates.total} no período)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-destructive">
              Erro ao carregar: {(error as Error).message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhum evento no período/filtros selecionados.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      data-testid="webhook-event-row"
                      data-remote-jid={row.remote_jid ?? ''}
                      data-push-name={row.push_name ?? ''}
                      data-message-type={row.message_type ?? ''}
                      data-status={row.error_message ? 'error' : row.processed ? 'processed' : 'pending'}
                    >
                      <TableCell className="text-xs whitespace-nowrap" data-testid="webhook-event-created-at">
                        {formatDateTimeCompact(row.created_at)}
                      </TableCell>
                      <TableCell data-testid="webhook-event-event-type">
                        <Badge variant="outline" className=" text-xs">
                          {row.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className=" text-xs" data-testid="webhook-event-instance">{row.instance_name}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col">
                          <span className="" data-testid="webhook-event-jid">{shortJid(row.remote_jid)}</span>
                          {row.push_name && (
                            <span
                              className="text-muted-foreground truncate max-w-[200px]"
                              data-testid="webhook-event-push-name"
                            >
                              {row.push_name}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-testid="webhook-event-status">
                        {row.error_message ? (
                          <Badge variant="destructive" className="text-xs">Erro</Badge>
                        ) : row.processed ? (
                          <Badge variant="outline" className="text-xs text-success border-success/40">
                            Processado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelected(row)}
                          title="Ver payload"
                          data-testid="webhook-event-details-button"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      )}

      {/* Details dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              {selected?.event_type}
            </DialogTitle>
            <DialogDescription>
              {selected && `${selected.instance_name} • ${formatDateTimeCompact(selected.created_at)}`}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Instância" value={selected.instance_name} />
                <Field label="Tipo de mensagem" value={selected.message_type || '—'} />
                <Field label="Remote JID" value={selected.remote_jid || '—'} mono />
                <Field label="From me" value={selected.from_me ? 'Sim' : 'Não'} />
                <Field label="Push name" value={selected.push_name || '—'} />
                <Field label="Processado" value={selected.processed ? 'Sim' : 'Não'} />
                <Field label="Processado em" value={formatDateTimeCompact(selected.processed_at)} />
                <Field label="Recebido em" value={formatDateTimeCompact(selected.created_at)} />
              </div>

              {selected.error_message && (
                <div>
                  <p className="text-xs font-semibold text-destructive mb-1">Erro</p>
                  <ScrollArea className="max-h-32 rounded border border-destructive/30 bg-destructive/5 p-2">
                    <pre className="text-xs whitespace-pre-wrap break-all">
                      {selected.error_message}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Payload completo</p>
                <ScrollArea className="max-h-80 rounded border bg-muted/40 p-2">
                  <pre className="text-xs whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground text-center">
        Fonte: <code>evolution_webhook_events</code> (FATOR X) · Limite 200 registros por consulta ·
        Auto-refresh a cada 60s
      </p>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, tone,
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
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <Icon className={cn('h-8 w-8 opacity-70', toneClasses)} />
      </CardContent>
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('font-medium break-all', mono && ' text-xs')}>{value}</p>
    </div>
  );
}
