/**
 * Admin: Webhook Overview Dashboard.
 * Aggregated view of `evolution_webhook_events` over a configurable window
 * with charts and per-instance breakdown. Drill-down lives in
 * `AdminWebhookEventsPage`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subHours } from 'date-fns';
import {
  Webhook, RefreshCw, Activity, CheckCircle2, XCircle, Server, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { queryExternalProxy } from '@/lib/externalProxy';
import { openWebhookEventsWithFilters } from '@/lib/webhookEventsDeepLink';
import { cn } from '@/lib/utils';
import type { EvolutionWebhookEvent } from '@/types/evolutionExternal';
import { formatDateTimeCompact } from '@/lib/formatters';
import {
  aggregateByType,
  aggregateByTypeAndInstance,
  aggregateHourly,
  categoryFill,
  type WebhookEventLite,
} from './admin-webhook-overview/aggregations';

const RANGE_OPTIONS = [
  { value: '1', label: 'Última hora' },
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '168', label: 'Últimos 7 dias' },
] as const;

// Capped at 200 — the proxy enforces HEAVY_TABLE_MAX_LIMIT=200 anyway.
// Asking for more just wastes a round-trip and risks Postgres timeouts.
const HARD_LIMIT = 200;


const AUTO_REFRESH_STORAGE_KEY = 'zappweb:webhook-overview:auto-refresh';
const AUTO_REFRESH_INTERVAL_MS = 60_000;

export default function AdminWebhookOverviewPage() {
  const [hours, setHours] = useState<string>('24');
  const [instance, setInstance] = useState<string>('all');
  const [includeUnprocessed, setIncludeUnprocessed] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    const stored = safeGetItem(AUTO_REFRESH_STORAGE_KEY);
    // Default ON when nothing stored — preserves prior behavior.
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    safeSetItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh));
  }, [autoRefresh]);

  const sinceISO = useMemo(
    () => subHours(new Date(), Number(hours)).toISOString(),
    [hours],
  );

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['admin-webhook-overview', hours, includeUnprocessed],
    queryFn: async () => {
      const filters: { column: string; operator: string; value: unknown }[] = [
        { column: 'created_at', operator: 'gte', value: sinceISO },
      ];
      if (!includeUnprocessed) {
        filters.push({ column: 'processed', operator: 'eq', value: true });
      }
      const res = await queryExternalProxy<EvolutionWebhookEvent>({
        table: 'evolution_webhook_events',
        select: 'event_type,instance_name,processed,error_message,created_at',
        filters,
        order: { column: 'created_at', ascending: false },
        limit: HARD_LIMIT,
      });
      return (res.data ?? []) as WebhookEventLite[];
    },
    staleTime: 30_000,
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (instance === 'all') return rows;
    return rows.filter((r) => r.instance_name === instance);
  }, [data, instance]);

  const byType = useMemo(() => aggregateByType(filtered), [filtered]);
  const matrix = useMemo(() => aggregateByTypeAndInstance(filtered), [filtered]);
  const hourly = useMemo(() => aggregateHourly(filtered, Number(hours)), [filtered, hours]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const errored = filtered.filter((r) => r.error_message).length;
    const processed = filtered.filter((r) => r.processed && !r.error_message).length;
    const instances = new Set(filtered.map((r) => r.instance_name)).size;
    const errorPct = total > 0 ? (errored / total) * 100 : 0;
    return { total, processed, errored, instances, errorPct };
  }, [filtered]);

  const allInstances = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.instance_name))).sort(),
    [data],
  );

  const sampleSaturated = (data?.length ?? 0) >= HARD_LIMIT;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6 text-primary" />
            Overview — Webhooks Evolution
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada de eventos por tipo e instância, com volume por hora e
            taxa de erro. Para drill-down evento-a-evento, use{' '}
            <span className="font-medium">Eventos do Webhook</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={instance} onValueChange={setInstance}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Instância" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas instâncias</SelectItem>
              {allInstances.map((i) => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
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
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/30"
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
              className="text-xs cursor-pointer select-none"
            >
              Auto-refresh 60s
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefetching && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </header>

      {sampleSaturated && (
        <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Mostrando os {HARD_LIMIT} eventos mais recentes da janela. Para volumes maiores,
          considere reduzir o período.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top eventos por tipo</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique numa barra para abrir o log filtrado por esse tipo
                  {instance !== 'all' ? ` na instância ${instance}` : ''}.
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(220, byType.length * 28)}>
                  <BarChart data={byType.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis type="number" tick={{ style: { fontSize: '0.75rem' } }} />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={{ style: { fontSize: '0.75rem' } }}
                      width={150}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="total"
                      name="Eventos"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={(payload: { type?: string } | undefined) => {
                        const t = payload?.type;
                        if (!t) return;
                        openWebhookEventsWithFilters({
                          eventType: t,
                          instance: instance !== 'all' ? instance : undefined,
                        });
                      }}
                    >
                      {byType.slice(0, 10).map((entry) => (
                        <Cell key={entry.type} fill={categoryFill(entry.type)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Volume por {Number(hours) <= 24 ? 'hora' : 'janela de 6h'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={hourly}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="bucket" tick={{ style: { fontSize: '0.75rem' } }} />
                    <YAxis tick={{ style: { fontSize: '0.75rem' } }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="processed"
                      name="Processados"
                      stackId="1"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.35}
                    />
                    <Area
                      type="monotone"
                      dataKey="errored"
                      name="Erros"
                      stackId="1"
                      stroke="hsl(var(--destructive))"
                      fill="hsl(var(--destructive))"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {matrix.instances.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Distribuição: tipo × instância</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique numa célula para abrir o log filtrado por tipo + instância.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[420px]">
                  <Table>
                    <caption className="sr-only">
                      Contagem de eventos de webhook por tipo e instância, com cor de
                      intensidade representando volume relativo. Células com volume
                      são clicáveis e abrem o log filtrado correspondente.
                    </caption>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[220px]">Tipo</TableHead>
                        {matrix.instances.map((i) => (
                          <TableHead key={i} className="text-center  text-xs">
                            {i}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matrix.types.map((t) => {
                        const rowTotal = matrix.instances.reduce(
                          (s, i) => s + (matrix.matrix[t]?.[i] ?? 0),
                          0,
                        );
                        const max = Math.max(
                          ...matrix.instances.map((i) => matrix.matrix[t]?.[i] ?? 0),
                          1,
                        );
                        return (
                          <TableRow key={t}>
                            <TableCell className=" text-xs">{t}</TableCell>
                            {matrix.instances.map((i) => {
                              const count = matrix.matrix[t]?.[i] ?? 0;
                              const intensity = count === 0 ? 0 : Math.min(1, count / max);
                              const cellStyle = count
                                ? { backgroundColor: `hsl(var(--primary) / ${(intensity * 0.35).toFixed(2)})` }
                                : undefined;
                              return (
                                <TableCell
                                  key={i}
                                  className="p-0 text-center text-xs "
                                  style={cellStyle}
                                >
                                  {count > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => openWebhookEventsWithFilters({ eventType: t, instance: i })}
                                      title={`Abrir log: ${t} em ${i} (${count} evento${count === 1 ? '' : 's'})`}
                                      className="w-full h-full px-2 py-2 cursor-pointer hover:ring-2 hover:ring-primary/40 hover:ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset transition-shadow"
                                    >
                                      {count}
                                    </button>
                                  ) : (
                                    <span className="block px-2 py-2 text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right font-semibold">
                              {rowTotal}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detalhamento por tipo</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Processados</TableHead>
                    <TableHead className="text-right">Erros</TableHead>
                    <TableHead className="text-right">% erro</TableHead>
                    <TableHead>Último evento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byType.map((row) => {
                    const pct = row.total > 0 ? (row.errored / row.total) * 100 : 0;
                    const high = pct > 5;
                    return (
                      <TableRow key={row.type}>
                        <TableCell className=" text-xs">{row.type}</TableCell>
                        <TableCell className="text-right font-semibold">{row.total}</TableCell>
                        <TableCell className="text-right text-success">{row.processed}</TableCell>
                        <TableCell className={cn('text-right', row.errored > 0 && 'text-destructive')}>
                          {row.errored}
                        </TableCell>
                        <TableCell className="text-right">
                          {high ? (
                            <Badge variant="destructive" className="text-xs">
                              {pct.toFixed(1)}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTimeCompact(row.lastAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Fonte: <code>evolution_webhook_events</code> (FATOR X) · Limite {HARD_LIMIT} registros ·
        Auto-refresh 60s
      </p>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: 'info' | 'success' | 'destructive' | 'warning';
}) {
  const toneClass = {
    info: 'text-primary',
    success: 'text-success',
    destructive: 'text-destructive',
    warning: 'text-warning',
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <Icon className={cn('h-8 w-8 opacity-70', toneClass)} />
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-[260px] w-full" />
        <Skeleton className="h-[260px] w-full" />
      </div>
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}
