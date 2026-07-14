import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend } from 'recharts';

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

export function TopReasonsChart({
  reasons,
  previousReasons = [],
  compareMode = false,
  windowHours = 24,
}: TopReasonsChartProps) {
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
    // Sort by max(current, previous) — most relevant rows surface first.
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
              formatter={(value: unknown, name: unknown) => {
                const label = name === 'previous' ? 'Período anterior' : 'Período atual';
                return [String(value ?? '') + ' retries', label];
              }}
              labelFormatter={(label: unknown) => String(label ?? '')}
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
