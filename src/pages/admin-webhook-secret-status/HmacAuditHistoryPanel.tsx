// @ts-nocheck
/**
 * HmacAuditHistoryPanel
 *
 * Histórico das execuções do botão "Testar HMAC" com:
 *  - Filtros: janela de tempo (24h / 7d / 30d) + instância.
 *  - KPIs da janela: total, OK, falhas, taxa de sucesso, duração média.
 *  - Gráfico de tendência (área empilhada OK vs FALHA).
 *  - Tabela das últimas execuções (cap configurável).
 *  - Atualização em tempo real via Realtime + debounce (300ms).
 */
import { useEffect, useState } from 'react';
import { History, RefreshCw, Radio, TrendingUp } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { RANGES, ALL_INSTANCES, tooltipStyle, fmtDate } from './hmacAuditHistoryHelpers';
import type { HmacAuditHistoryPanelProps, RangeKey } from './hmacAuditHistoryHelpers';
import { useHmacAuditHistory } from './useHmacAuditHistory';

export function HmacAuditHistoryPanel({
  instance: initialInstance = null,
  limit = 25,
}: HmacAuditHistoryPanelProps) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [instanceFilter, setInstanceFilter] = useState<string>(initialInstance ?? ALL_INSTANCES);

  useEffect(() => {
    setInstanceFilter(initialInstance ?? ALL_INSTANCES);
  }, [initialInstance]);

  const rangeCfg = useMemo(() => RANGES.find((r) => r.value === range) ?? RANGES[0], [range]);
  const since = useMemo(() => subHours(new Date(), rangeCfg.hours).toISOString(), [rangeCfg]);

  const queryKey = useMemo(
    () => ['hmac-selftest-audit', range, instanceFilter],
    [range, instanceFilter]
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await safeClient.from<AuditRow>('hmac_selftest_audit', (q) => {
        let query = q
          .select(
            'id, instance, ok, duration_ms, error, message, good_accepted, tampered_rejected, created_at'
          )
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(2000);
        if (instanceFilter !== ALL_INSTANCES) query = query.eq('instance', instanceFilter);
        return query;
      });
      // Return empty array when table is not yet provisioned (pending migration)
      if (error) return [] as AuditRow[];
      return data ?? [];
    },
    retry: false,
    staleTime: 5_000,
    refetchInterval: realtimeStatus === 'live' ? 60_000 : 20_000,
  });

  // Lista de instâncias derivada dos próprios registros da janela atual,
  // mas usando uma query secundária independente do filtro de instância para
  // o usuário sempre ver TODAS as instâncias disponíveis no período.
  const { data: instanceOptions } = useQuery({
    queryKey: ['hmac-selftest-audit-instances', range],
    queryFn: async () => {
      const { data, error } = await safeClient.from('hmac_selftest_audit', (q) =>
        q.select('instance').gte('created_at', since).not('instance', 'is', null).limit(1000)
      );
      // Return empty list when table is not yet provisioned
      if (error) return [] as string[];
      const set = new Set<string>();
      (data ?? []).forEach((r: { instance: string | null }) => {
        if (r.instance) set.add(r.instance);
      });
      return Array.from(set).sort();
    },
    retry: false,
    staleTime: 30_000,
  });

  // Realtime — atualiza ambas as queries ao receber INSERT.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('hmac-selftest-audit-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'hmac_selftest_audit' },
        () => {
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['hmac-selftest-audit'] });
            queryClient.invalidateQueries({ queryKey: ['hmac-selftest-audit-instances'] });
          }, 300);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('offline');
        } else setRealtimeStatus('connecting');
      });
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      channel.unsubscribe();
    };
  }, [queryClient]);

  const rows = data ?? [];
  const visibleRows = rows.slice(0, limit);

  const stats = useMemo(() => {
    const total = rows.length;
    const oks = rows.filter((r) => r.ok).length;
    const fails = total - oks;
    const successRate = total > 0 ? Math.round((oks / total) * 1000) / 10 : 0;
    const avgDuration =
      total > 0 ? Math.round(rows.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / total) : 0;
    return { total, oks, fails, successRate, avgDuration };
  }, [rows]);

  const trendData = useMemo(() => bucketize(rows, rangeCfg.bucket), [rows, rangeCfg.bucket]);

  return (
    <Card data-testid="hmac-audit-history-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4" />
            Histórico de testes HMAC
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Resultado, duração e tendência das execuções de <code>Testar HMAC</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={range}
            onValueChange={(v) =>
              setRange(
                v as RangeKey /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
          >
            <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="hmac-audit-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={instanceFilter} onValueChange={setInstanceFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="hmac-audit-instance">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_INSTANCES} className="text-xs">
                Todas as instâncias
              </SelectItem>
              {instanceOptions.map((i) => (
                <SelectItem key={i} value={i} className="text-xs">
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5 text-[10px]',
              realtimeStatus === 'live' && 'border-success/40 bg-success/10 text-success',
              realtimeStatus === 'offline' &&
                'border-destructive/40 bg-destructive/10 text-destructive',
              realtimeStatus === 'connecting' && 'border-muted-foreground/30 text-muted-foreground'
            )}
            data-testid="hmac-audit-realtime-status"
          >
            <Radio className={cn('h-2.5 w-2.5', realtimeStatus === 'live' && 'animate-pulse')} />
            {realtimeStatus === 'live'
              ? 'Ao vivo'
              : realtimeStatus === 'connecting'
                ? '…'
                : 'Offline'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="hmac-audit-refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs da janela */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-lg border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Execuções</div>
            <div className="text-lg font-bold" data-testid="hmac-audit-total-count">
              {stats.total}
            </div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">OK</div>
            <div className="text-lg font-bold text-success" data-testid="hmac-audit-ok-count">
              {stats.oks}
            </div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Falhas</div>
            <div className="text-lg font-bold text-destructive" data-testid="hmac-audit-fail-count">
              {stats.fails}
            </div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Taxa de sucesso</div>
            <div
              className={cn(
                'text-lg font-bold',
                stats.total === 0 && 'text-muted-foreground',
                stats.total > 0 && stats.successRate >= 99 && 'text-success',
                stats.total > 0 &&
                  stats.successRate < 99 &&
                  stats.successRate >= 90 &&
                  'text-warning',
                stats.total > 0 && stats.successRate < 90 && 'text-destructive'
              )}
              data-testid="hmac-audit-success-rate"
            >
              {stats.total === 0 ? '—' : `${stats.successRate}%`}
            </div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Duração média</div>
            <div className="text-lg font-bold" data-testid="hmac-audit-avg-duration">
              {stats.avgDuration}
              <span className="ml-1 text-xs text-muted-foreground">ms</span>
            </div>
          </div>
        </div>

        {/* Gráfico de tendência */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Tendência por {rangeCfg.bucket === 'hour' ? 'hora' : 'dia'}
          </div>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
              Carregando…
            </div>
          ) : trendData.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
              Sem execuções no período.
            </div>
          ) : (
            <div data-testid="hmac-audit-trend-chart">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis
                    dataKey="time"
                    tick={{ style: { fontSize: '0.75rem' } }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ style: { fontSize: '0.75rem' } }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.6875rem' }} />
                  <Area
                    type="monotone"
                    dataKey="ok"
                    stackId="1"
                    name="OK"
                    stroke="hsl(var(--success))"
                    fill="hsl(var(--success))"
                    fillOpacity={0.35}
                  />
                  <Area
                    type="monotone"
                    dataKey="fail"
                    stackId="1"
                    name="Falha"
                    stroke="hsl(var(--destructive))"
                    fill="hsl(var(--destructive))"
                    fillOpacity={0.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Tabela das últimas N execuções */}
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Últimas {Math.min(limit, visibleRows.length)} execuções
          </div>
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded border border-dashed py-6 text-center text-sm text-muted-foreground">
              Nenhuma execução registrada no período
              {instanceFilter !== ALL_INSTANCES ? ` para ${instanceFilter}` : ''}.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Quando</TableHead>
                    <TableHead className="text-xs">Instância</TableHead>
                    <TableHead className="text-xs">Resultado</TableHead>
                    <TableHead className="text-right text-xs">Duração</TableHead>
                    <TableHead className="text-xs">Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => (
                    <TableRow
                      key={r.id}
                      data-testid="hmac-audit-row"
                      data-result={r.ok ? 'ok' : 'fail'}
                    >
                      <TableCell className="whitespace-nowrap text-xs">
                        {fmtDate(r.created_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <code className="text-[11px]">{r.instance ?? '—'}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.ok ? 'default' : 'destructive'} className="text-[10px]">
                          {r.ok ? 'OK' : 'FALHA'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r.duration_ms ?? '—'}
                        <span className="ml-0.5 text-muted-foreground">ms</span>
                      </TableCell>
                      <TableCell
                        className="max-w-[280px] truncate text-xs text-muted-foreground"
                        title={r.error ?? r.message ?? ''}
                      >
                        {r.error ??
                          r.message ??
                          (r.tampered_rejected === false
                            ? '⚠ assinatura adulterada foi aceita'
                            : '—')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
