import { useMemo } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { subHours, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Activity, CheckCircle2, XCircle, Webhook, Server } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { queryExternalProxy } from '@/lib/externalProxy';
import { aggregateHourly, type WebhookEventLite } from '@/pages/admin-webhook-overview/aggregations';
import { setPendingWebhookEventsFilters } from '@/lib/webhookEventsDeepLink';

interface Props {
  windowHours: number;
  autoRefresh: boolean;
  onNavigateTo?: (viewId: string) => void;
}

const HARD_LIMIT = 200;

/** Events Live Block. */
export function EventsLiveBlock({ windowHours, autoRefresh, onNavigateTo }: Props) {
  const sinceISO = useMemo(() => subHours(new Date(), windowHours).toISOString(), [windowHours]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminOps.realtimeMonitorEvents(windowHours),
    queryFn: async (): Promise<WebhookEventLite[]> => {
      const res = await queryExternalProxy<WebhookEventLite>({
        table: 'evolution_webhook_events',
        select: 'event_type,instance_name,processed,error_message,created_at',
        filters: [{ column: 'created_at', operator: 'gte', value: sinceISO }],
        order: { column: 'created_at', ascending: false },
        limit: HARD_LIMIT,
      });
      return (res.data ?? []) as WebhookEventLite[];
    },
    staleTime: 10_000,
    refetchInterval: autoRefresh ? 15_000 : false,
  });

  const rows = data ?? [];
  const totals = useMemo(() => {
    const total = rows.length;
    const errored = rows.filter((r) => r.error_message).length;
    const processed = rows.filter((r) => r.processed && !r.error_message).length;
    const minutes = Math.max(1, windowHours * 60);
    return {
      total,
      processed,
      errored,
      ratePerMin: Math.round((total / minutes) * 100) / 100,
    };
  }, [rows, windowHours]);

  const chartData = useMemo(() => aggregateHourly(rows, windowHours), [rows, windowHours]);

  const handleRowClick = (eventType: string, instance: string) => {
    setPendingWebhookEventsFilters({ eventType, instance });
    onNavigateTo?.('webhook-events');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-5 w-5 text-primary" />
          Eventos recebidos (últimas {windowHours}h)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={Activity} label="Total" value={totals.total} />
          <Kpi icon={CheckCircle2} label="Processados" value={totals.processed} tone="success" />
          <Kpi icon={XCircle} label="Com erro" value={totals.errored} tone={totals.errored > 0 ? 'destructive' : 'info'} />
          <Kpi icon={Server} label="Eventos/min" value={totals.ratePerMin} />
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">Erro: {(error as Error).message}</p>
        ) : rows.length === 0 ? (
          <GenericEmptyState
            icon={Webhook}
            title="Sem eventos no período"
            description="Nenhum evento de webhook foi recebido nesta janela."
          />
        ) : (
          <>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="bucket" tick={{ style: { fontSize: '0.75rem' } }} />
                  <YAxis tick={{ style: { fontSize: '0.75rem' } }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="processed" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.3)" />
                  <Area type="monotone" dataKey="errored" stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.4)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 20).map((r) => (
                    <TableRow
                      key={`${r.created_at}-${r.event_type}-${r.instance_name}`}
                      className="cursor-pointer hover:bg-muted/40"
                      tabIndex={0}
                      onClick={() => handleRowClick(r.event_type, r.instance_name)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleRowClick(r.event_type, r.instance_name)}
                    >
                      <TableCell className="text-xs">
                        {format(new Date(r.created_at), 'HH:mm:ss', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-xs ">{r.event_type}</TableCell>
                      <TableCell className="text-xs">{r.instance_name}</TableCell>
                      <TableCell>
                        {r.error_message ? (
                          <Badge variant="destructive" className="text-[10px]">erro</Badge>
                        ) : r.processed ? (
                          <Badge variant="outline" className="text-[10px] text-primary border-primary/40">ok</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">pendente</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  icon: Icon, label, value, tone = 'info',
}: { icon: typeof Activity; label: string; value: number | string; tone?: 'success' | 'destructive' | 'info' }) {
  const cls = tone === 'success'
    ? 'text-primary'
    : tone === 'destructive'
      ? 'text-destructive'
      : 'text-foreground';
  return (
    <div className="rounded-lg border p-3 flex items-center gap-3">
      <Icon className={`h-5 w-5 ${cls}`} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${cls}`}>{value}</p>
      </div>
    </div>
  );
}
