// @ts-nocheck
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, ShieldAlert, Filter } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

type Window = '24h' | '7d';

interface TrendRow {
  bucket: string;
  instance_name: string;
  invalid_signature: number;
  auth_401: number;
  auth_403: number;
  total: number;
}

interface SummaryResp {
  window_hours: number;
  total: number;
  invalid_signature: number;
  auth_401: number;
  auth_403: number;
  first_event_at: string | null;
  last_event_at: string | null;
  top_instances: Array<{
    instance_name: string;
    total: number;
    invalid_signature: number;
    auth_401: number;
    auth_403: number;
  }>;
}

const WINDOW_HOURS: Record<Window, number> = { '24h': 24, '7d': 168 };

function formatBucket(ts: string, window: Window) {
  const d = new Date(ts);
  if (window === '7d') {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit' });
  }
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function AuthEventTrendChart() {
  const [window, setWindow] = useState<Window>('24h');
  const [instanceFilter, setInstanceFilter] = useState('');

  const filterTrim = instanceFilter.trim() || null;
  const hours = WINDOW_HOURS[window];

  const trendQuery = useQuery({
    queryKey: ['auth-event-trend', hours, filterTrim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_instance_auth_event_trend', {
        p_hours: hours,
        p_instance: filterTrim,
      });
      if (error) throw error;
      return (data ?? []) as TrendRow[];
    },
    refetchInterval: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ['auth-event-summary', hours, filterTrim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_instance_auth_event_summary', {
        p_hours: hours,
        p_instance: filterTrim,
      });
      if (error) throw error;
      return data as unknown as SummaryResp;
    },
    refetchInterval: 30_000,
  });

  // Agrega buckets entre instâncias (gráfico mostra totais por motivo)
  const chartData = useMemo(() => {
    const rows = trendQuery.data ?? [];
    const map = new Map<string, { time: string; invalid_signature: number; auth_401: number; auth_403: number }>();
    for (const r of rows) {
      const key = r.bucket;
      const cur = map.get(key) ?? {
        time: formatBucket(r.bucket, window),
        invalid_signature: 0, auth_401: 0, auth_403: 0,
      };
      cur.invalid_signature += r.invalid_signature;
      cur.auth_401 += r.auth_401;
      cur.auth_403 += r.auth_403;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [trendQuery.data, window]);

  const summary = summaryQuery.data;
  const isLoading = trendQuery.isLoading || summaryQuery.isLoading;
  const totalRate = summary && summary.total > 0
    ? `${(summary.total / hours).toFixed(1)} eventos/h`
    : '0 eventos/h';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Tendência de falhas de autenticação
            </CardTitle>
            <CardDescription>
              Eventos <code>invalid_signature</code> (webhook) e <code>auth_401/403</code> (Evolution API) por instância.
            </CardDescription>
          </div>
          <Tabs value={window} onValueChange={(v) => setWindow(v as Window)}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7 dias</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-end gap-3 mt-2">
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="instance-filter" className="flex items-center gap-1 text-xs">
              <Filter className="h-3 w-3" /> Instância (opcional)
            </Label>
            <Input
              id="instance-filter"
              placeholder="Todas"
              value={instanceFilter}
              onChange={(e) => setInstanceFilter(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{summary?.total ?? 0}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{totalRate}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              invalid_signature
            </div>
            <div className="text-2xl font-bold">{summary?.invalid_signature ?? 0}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-warning" />
              auth_401
            </div>
            <div className="text-2xl font-bold">{summary?.auth_401 ?? 0}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" />
              auth_403
            </div>
            <div className="text-2xl font-bold">{summary?.auth_403 ?? 0}</div>
          </div>
        </div>

        {/* Gráfico */}
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg">
            <ShieldAlert className="h-8 w-8 mb-2 opacity-40" />
            Nenhum evento de autenticação registrado nesta janela.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone" dataKey="invalid_signature" name="invalid_signature"
                stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))"
                fillOpacity={0.55}
              />
              <Area
                type="monotone" dataKey="auth_401" name="auth_401"
                stackId="1" stroke="hsl(45 93% 47%)" fill="hsl(45 93% 47%)"
                fillOpacity={0.45}
              />
              <Area
                type="monotone" dataKey="auth_403" name="auth_403"
                stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))"
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Top instâncias */}
        {summary && summary.top_instances.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2">Top instâncias</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Instância</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">invalid_signature</th>
                    <th className="py-2 pr-4 text-right">auth_401</th>
                    <th className="py-2 pr-4 text-right">auth_403</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top_instances.map((row) => (
                    <tr key={row.instance_name} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4  text-xs">{row.instance_name}</td>
                      <td className="py-2 pr-4 text-right">
                        <Badge variant="subtle">{row.total}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right text-xs">{row.invalid_signature}</td>
                      <td className="py-2 pr-4 text-right text-xs">{row.auth_401}</td>
                      <td className="py-2 pr-4 text-right text-xs">{row.auth_403}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
