// @ts-nocheck
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Activity, Timer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AlertInstanceSLACard } from './AlertInstanceSLACard';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: string | null;
}

interface TrendRow {
  bucket: string;
  instance_name: string;
  invalid_signature: number;
  auth_401: number;
  auth_403: number;
  total: number;
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
} as const;

function formatHour(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function AlertInstanceDetailDialog({ open, onOpenChange, instance }: Props) {
  const enabled = open && !!instance;

  const { data: rows, isLoading } = useQuery({
    queryKey: ['alert-instance-detail', instance],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_instance_auth_event_trend', {
        p_hours: 24,
        p_instance: instance!,
      });
      if (error) throw error;
      return ((data ?? []) as TrendRow[])
        .filter((r) => !instance || r.instance_name === instance)
        .sort((a, b) => a.bucket.localeCompare(b.bucket));
    },
    enabled,
    refetchInterval: 30_000,
  });

  const invalidPctData = useMemo(() => {
    return (rows ?? []).map((r) => {
      const invalid = r.invalid_signature + r.auth_401 + r.auth_403;
      const total = Math.max(r.total, invalid);
      const pct = total > 0 ? (invalid / total) * 100 : 0;
      return {
        time: formatHour(r.bucket),
        invalido: Number(pct.toFixed(1)),
        total,
      };
    });
  }, [rows]);

  const intervalData = useMemo(() => {
    const withEvents = (rows ?? []).filter(
      (r) => r.invalid_signature + r.auth_401 + r.auth_403 > 0
    );
    const out: { time: string; intervaloMin: number }[] = [];
    for (let i = 1; i < withEvents.length; i++) {
      const prev = new Date(withEvents[i - 1].bucket).getTime();
      const cur = new Date(withEvents[i].bucket).getTime();
      out.push({
        time: formatHour(withEvents[i].bucket),
        intervaloMin: Math.round((cur - prev) / 60_000),
      });
    }
    return out;
  }, [rows]);

  const slaIncidents = useMemo(() => {
    const ordered = rows ?? [];
    type Incident = { startIso: string; endIso: string | null; minutesToResolve: number | null };
    const incidents: Incident[] = [];
    let openStart: string | null = null;
    for (const r of ordered) {
      const isBad = r.invalid_signature + r.auth_401 + r.auth_403 > 0;
      if (isBad && !openStart) {
        openStart = r.bucket;
      } else if (!isBad && openStart) {
        const minutes = Math.round(
          (new Date(r.bucket).getTime() - new Date(openStart).getTime()) / 60_000
        );
        incidents.push({ startIso: openStart, endIso: r.bucket, minutesToResolve: minutes });
        openStart = null;
      }
    }
    if (openStart) {
      incidents.push({ startIso: openStart, endIso: null, minutesToResolve: null });
    }
    return incidents;
  }, [rows]);

  const sla = useMemo(() => {
    const resolved = slaIncidents.filter((i) => i.minutesToResolve !== null) as Array<{
      minutesToResolve: number;
    }>;
    const open = slaIncidents.length - resolved.length;
    if (resolved.length === 0) {
      return {
        total: slaIncidents.length,
        resolved: 0,
        open,
        avgMin: 0,
        maxMin: 0,
        p95Min: 0,
      };
    }
    const values = resolved.map((i) => i.minutesToResolve).sort((a, b) => a - b);
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const max = values[values.length - 1];
    const p95Idx = Math.min(values.length - 1, Math.floor(values.length * 0.95));
    return {
      total: slaIncidents.length,
      resolved: resolved.length,
      open,
      avgMin: avg,
      maxMin: max,
      p95Min: values[p95Idx],
    };
  }, [slaIncidents]);

  const totals = useMemo(() => {
    const r = rows ?? [];
    const invalid = r.reduce((s, x) => s + x.invalid_signature + x.auth_401 + x.auth_403, 0);
    const total = r.reduce(
      (s, x) => s + Math.max(x.total, x.invalid_signature + x.auth_401 + x.auth_403),
      0
    );
    const pct = total > 0 ? (invalid / total) * 100 : 0;
    const avgInterval =
      intervalData.length > 0
        ? Math.round(intervalData.reduce((s, x) => s + x.intervaloMin, 0) / intervalData.length)
        : 0;
    return { invalid, total, pct: pct.toFixed(1), avgInterval };
  }, [rows, intervalData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Diagnóstico da instância
            {instance && <code className="rounded bg-muted px-2 py-0.5 text-xs">{instance}</code>}
          </DialogTitle>
          <DialogDescription>
            Últimas 24h — eventos inválidos e intervalos entre ocorrências.
          </DialogDescription>
        </DialogHeader>

        {!instance ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma instância associada a este alerta.
          </div>
        ) : isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Eventos totais</div>
                  <div className="text-2xl font-bold">{totals.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Inválidos</div>
                  <div className="text-2xl font-bold text-destructive">{totals.invalid}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">% inválido</div>
                  <div className="text-2xl font-bold text-warning">{totals.pct}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Intervalo médio</div>
                  <div className="text-2xl font-bold">
                    {totals.avgInterval}
                    <span className="ml-1 text-sm">min</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <AlertInstanceSLACard sla={sla} />

            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4 text-destructive" />% de eventos inválidos por hora
                </div>
                {invalidPctData.length === 0 ? (
                  <div className="flex h-48 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                    Sem eventos no período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={invalidPctData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis
                        dataKey="time"
                        tick={{ style: { fontSize: '0.75rem' } }}
                        className="fill-muted-foreground"
                      />
                      <YAxis
                        tick={{ style: { fontSize: '0.75rem' } }}
                        className="fill-muted-foreground"
                        unit="%"
                        domain={[0, 100]}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.6875rem' }} />
                      <Area
                        type="monotone"
                        dataKey="invalido"
                        name="% inválido"
                        stroke="hsl(var(--destructive))"
                        fill="hsl(var(--destructive))"
                        fillOpacity={0.35}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Intervalos */}
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Timer className="h-4 w-4 text-primary" />
                  Intervalo entre eventos consecutivos (min)
                </div>
                {intervalData.length === 0 ? (
                  <div className="flex h-48 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                    Não há eventos suficientes para calcular intervalos.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={intervalData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis
                        dataKey="time"
                        tick={{ style: { fontSize: '0.75rem' } }}
                        className="fill-muted-foreground"
                      />
                      <YAxis
                        tick={{ style: { fontSize: '0.75rem' } }}
                        className="fill-muted-foreground"
                        unit="m"
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Bar
                        dataKey="intervaloMin"
                        name="Intervalo (min)"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
