import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import {
  Activity,
  RefreshCw,
  Copy,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RetryAlertsConfig } from './RetryAlertsConfig';
import { RetryAlertsBanner } from './RetryAlertsBanner';
import { RetrySchedulePreview } from './RetrySchedulePreview';
import { TopReasonsChart } from './TopReasonsChart';
import { useRetryMetricsPanelState } from './useRetryMetricsPanelState';

const HOURS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1h' },
  { value: 6, label: '6h' },
  { value: 24, label: '24h' },
  { value: 168, label: '7d' },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function statusVariant(status: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'success':
      return 'default';
    case 'failed':
    case 'exhausted':
      return 'destructive';
    default:
      return 'outline';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="mr-1 h-3 w-3" />;
    case 'failed':
      return <XCircle className="mr-1 h-3 w-3" />;
    case 'exhausted':
      return <AlertTriangle className="mr-1 h-3 w-3" />;
    default:
      return null;
  }
}

interface KpiCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  delta?: number | null;
}

function KpiCard({ label, value, subtitle, delta }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold">{value}</span>
        {typeof delta === 'number' && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[10px] font-medium',
              delta > 0 ? 'text-warning-foreground' : 'text-primary'
            )}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {subtitle && <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function RetryMetricsPanel() {
  const {
    hours,
    setHours,
    actionFilter,
    setActionFilter,
    statusFilter,
    setStatusFilter,
    expanded,
    toggle,
    thresholds,
    setThresholds,
    perInstance,
    setPerInstance,
    dedupeMode,
    setDedupeMode,
    compareMode,
    setCompareMode,
    rows,
    agg,
    data,
    isLoading,
    refetch,
    isFetching,
    byInstance,
    breaches,
    actionOptions,
    copy,
  } = useRetryMetricsPanelState();

  const deltaPct = data?.deltaPct;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Métricas de Retry — Evolution API
            </CardTitle>
            <CardDescription>
              Tentativas, motivos e duração de chamadas com retry no proxy server-side.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(hours)} onValueChange={(v) => setHours(parseInt(v, 10))}>
              <SelectTrigger className="h-8 w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="failed">Falha</SelectItem>
                <SelectItem value="exhausted">Esgotado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas ações</SelectItem>
                {actionOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex h-8 items-center gap-1.5 rounded-md border bg-card px-2">
              <Switch
                id="compare-mode"
                checked={compareMode}
                onCheckedChange={setCompareMode}
                className="scale-75 data-[state=checked]:bg-primary"
              />
              <Label htmlFor="compare-mode" className="cursor-pointer select-none text-[11px]">
                Comparar período
              </Label>
            </div>
            <RetryAlertsConfig
              value={thresholds}
              onChange={setThresholds}
              perInstance={perInstance}
              onPerInstanceChange={setPerInstance}
              dedupeMode={dedupeMode}
              onDedupeModeChange={setDedupeMode}
              knownInstances={byInstance.map((b) => b.instance)}
              hasBreaches={breaches.length > 0}
            />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label={`Total (${hours}h)`} value={agg?.total ?? 0} delta={deltaPct} />
          <KpiCard
            label="Sucesso após retry"
            value={`${agg?.successRate ?? 0}%`}
            subtitle={`${agg?.successAfterRetry ?? 0} runs`}
          />
          <KpiCard
            label="p95 tentativas"
            value={agg?.p95Attempts ?? 0}
            subtitle={`p50: ${agg?.p50Attempts ?? 0}`}
          />
          <KpiCard label="Duração média" value={`${agg?.avgDurationMs ?? 0}ms`} />
        </div>

        <RetryAlertsBanner breaches={breaches} />
        <RetrySchedulePreview instances={byInstance.map((b) => b.instance)} />

        {agg && agg.topReasons.length > 0 && (
          <TopReasonsChart
            reasons={agg.topReasons}
            previousReasons={data?.previousTopReasons ?? []}
            compareMode={compareMode}
            windowHours={hours}
          />
        )}

        {isLoading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <GenericEmptyState
            icon={Activity}
            title="Sem retries registrados"
            description="Nenhum retry no período selecionado. Envios de primeira-tentativa não geram registros."
            className="py-8"
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Quando</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="hidden md:table-cell">Instância</TableHead>
                  <TableHead className="text-center">Tentativas</TableHead>
                  <TableHead>Status final</TableHead>
                  <TableHead className="hidden lg:table-cell">HTTP</TableHead>
                  <TableHead>Motivos</TableHead>
                  <TableHead className="hidden xl:table-cell">Idempotency Key</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isOpen = expanded.has(row.id);
                  return (
                    <>
                      <TableRow
                        key={row.id}
                        role="button"
                        aria-expanded={isOpen}
                        className="cursor-pointer"
                        onClick={() => toggle(row.id)}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {isOpen ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            {timeAgo(row.created_at)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{row.action}</TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {row.instance_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">
                            {row.attempt_count}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.final_status)} className="text-[10px]">
                            {statusIcon(row.final_status)}
                            {row.final_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs lg:table-cell">
                          {row.final_http_status ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(row.retry_reasons ?? []).slice(0, 2).map((rr) => (
                              <Badge key={rr.reason} variant="secondary" className="text-[9px]">
                                {rr.reason}
                              </Badge>
                            ))}
                            {(row.retry_reasons ?? []).length > 2 && (
                              <Badge variant="outline" className="text-[9px]">
                                +{row.retry_reasons.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {row.idempotency_key ? (
                            <span className="inline-flex items-center gap-1">
                              <code className="text-[10px] text-muted-foreground">
                                {row.idempotency_key.slice(0, 10)}…
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copy(row.idempotency_key!);
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {row.total_duration_ms ? `${row.total_duration_ms}ms` : '—'}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow
                          key={`${row.id}-details`}
                          className="bg-muted/20 hover:bg-muted/20"
                        >
                          <TableCell colSpan={9}>
                            <div className="space-y-2 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Detalhes do retry
                              </p>
                              <pre className="max-h-40 overflow-x-auto rounded border bg-background p-2 text-[10px]">
                                {JSON.stringify(
                                  {
                                    method: row.method,
                                    retry_reasons: row.retry_reasons,
                                    idempotency_key: row.idempotency_key,
                                    created_at: row.created_at,
                                  },
                                  null,
                                  2
                                )}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface KpiCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  delta?: number | null;
}

function KpiCard({ label, value, subtitle, delta }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold">{value}</span>
        {typeof delta === 'number' && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[10px] font-medium',
              delta > 0 ? 'text-warning-foreground' : 'text-primary'
            )}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {subtitle && <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

interface TopReasonsChartProps {
  reasons: Array<{ reason: string; count: number }>;
  previousReasons?: Array<{ reason: string; count: number }>;
  compareMode?: boolean;
  windowHours?: number;
}

function deltaTone(
  curr: number,
  prev: number
): { tone: 'up' | 'down' | 'flat'; pct: number | null } {
  if (prev === 0 && curr === 0) return { tone: 'flat', pct: 0 };
  if (prev === 0) return { tone: 'up', pct: null };
  const pct = Math.round(((curr - prev) / prev) * 1000) / 10;
  if (pct > 0) return { tone: 'up', pct };
  if (pct < 0) return { tone: 'down', pct };
  return { tone: 'flat', pct };
}

function TopReasonsChart({
  reasons,
  previousReasons = [],
  compareMode = false,
  windowHours = 24,
}: TopReasonsChartProps) {
  // Build merged dataset: union of top reasons across both periods so the user
  // sees both NEW reasons that emerged AND old reasons that disappeared.
  const data = useMemo(() => {
    if (!compareMode) {
      return reasons.slice(0, 10).map((r) => ({ reason: r.reason, current: r.count, previous: 0 }));
    }
    const prevMap = new Map(previousReasons.map((r) => [r.reason, r.count]));
    const currMap = new Map(reasons.map((r) => [r.reason, r.count]));
    const allReasons = new Set<string>([...currMap.keys(), ...prevMap.keys()]);
    const merged = Array.from(allReasons).map((reason) => ({
      reason,
      current: currMap.get(reason) ?? 0,
      previous: prevMap.get(reason) ?? 0,
    }));
    // Sort by max(current, previous) so the most relevant rows surface,
    // then keep top 10.
    merged.sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous));
    return merged.slice(0, 10);
  }, [reasons, previousReasons, compareMode]);

  const total = useMemo(() => data.reduce((s, d) => s + d.current, 0), [data]);
  const previousTotal = useMemo(() => data.reduce((s, d) => s + d.previous, 0), [data]);
  const chartHeight = Math.max(180, data.length * (compareMode ? 44 : 32));

  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Top {data.length} motivos de retry
          {compareMode && (
            <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
              · atual vs. {windowHours}h anteriores
            </span>
          )}
        </p>
        <span className="text-[10px] text-muted-foreground">
          {total} ocorrências{compareMode && ` · anterior: ${previousTotal}`}
        </span>
      </div>
      <div style={{ width: '100%', height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            barCategoryGap={6}
          >
            <XAxis
              type="number"
              tick={{ style: { fontSize: '0.75rem' }, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="reason"
              width={140}
              tick={{
                fontSize: 10,
                fill: 'hsl(var(--foreground))',
                fontFamily: 'ui-monospace, monospace',
              }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 11,
                color: 'hsl(var(--popover-foreground))',
              }}
              formatter={(value: number | string, name: number | string) => {
                const label = name === 'previous' ? 'Período anterior' : 'Período atual';
                return [String(value ?? '') + ' retries', label];
              }}
              labelFormatter={(label: unknown) => String(label || '')}
            />
            {compareMode && (
              <Legend
                wrapperStyle={{ fontSize: '0.75rem', paddingTop: 4 }}
                iconType="square"
                formatter={(v) => (v === 'previous' ? 'Período anterior' : 'Período atual')}
              />
            )}
            {compareMode && (
              <Bar
                dataKey="previous"
                radius={[0, 4, 4, 0]}
                fill="hsl(var(--muted-foreground) / 0.45)"
              />
            )}
            <Bar dataKey="current" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))">
              {!compareMode &&
                data.map((_, i) => <Cell key={i} fill={`hsl(var(--primary) / ${1 - i * 0.06})`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Comparison delta list — surfaces shifts even when bars are similar. */}
      {compareMode && data.length > 0 && (
        <ul className="mt-3 space-y-1">
          {data.map((d) => {
            const { tone, pct } = deltaTone(d.current, d.previous);
            const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Minus;
            const toneClass =
              tone === 'up'
                ? 'text-warning-foreground'
                : tone === 'down'
                  ? 'text-primary'
                  : 'text-muted-foreground';
            return (
              <li
                key={d.reason}
                className="flex items-center justify-between gap-3 rounded border border-border/40 bg-background/50 px-2 py-1 text-[11px]"
              >
                <span className="truncate">{d.reason}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">{d.previous}</span>
                  <span className="text-muted-foreground/60">→</span>
                  <span>{d.current}</span>
                  <span
                    className={cn('inline-flex w-14 items-center justify-end gap-0.5', toneClass)}
                  >
                    <Icon className="h-3 w-3" />
                    {pct === null ? 'novo' : `${Math.abs(pct)}%`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
