/**
 * AlertInstanceDetailDialog
 *
 * Painel detalhado por instância acionado a partir de um cartão de alerta.
 * Mostra para as últimas 24h:
 *  - % de eventos inválidos (invalid_signature + auth_401/403) por bucket horário
 *  - Intervalo (minutos) entre eventos de autenticação consecutivos
 *
 * Reutiliza as RPCs já existentes:
 *  - rpc_instance_auth_event_trend(p_hours, p_instance) — buckets horários
 *  - rpc_instance_auth_event_summary(p_hours, p_instance) — totais agregados
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Activity, Timer, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
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
        p_instance: instance,
      });
      if (error) throw error;
      return ((data ?? []) as TrendRow[])
        .filter(r => !instance || r.instance_name === instance)
        .sort((a, b) => a.bucket.localeCompare(b.bucket));
    },
    enabled,
    refetchInterval: 30_000,
  });

  // Série %inválido por bucket
  const invalidPctData = useMemo(() => {
    return (rows ?? []).map(r => {
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

  // Intervalo entre buckets com eventos (min)
  const intervalData = useMemo(() => {
    const withEvents = (rows ?? []).filter(r =>
      (r.invalid_signature + r.auth_401 + r.auth_403) > 0
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

  // SLA por instância — incidentes (run de buckets com inválidos) e tempo até resolução.
  // Definição:
  //  - Incidente inicia em um bucket com >=1 evento inválido após um bucket "limpo" (ou início da janela).
  //  - Incidente é resolvido quando aparece um bucket "limpo" subsequente.
  //  - Tempo até resolver = (bucket_resolução - bucket_início) em minutos.
  //  - Incidentes ainda abertos (sem resolução até o fim da janela) são sinalizados separadamente.
  const slaIncidents = useMemo(() => {
    const ordered = rows ?? [];
    type Incident = { startIso: string; endIso: string | null; minutesToResolve: number | null };
    const incidents: Incident[] = [];
    let openStart: string | null = null;
    for (const r of ordered) {
      const isBad = (r.invalid_signature + r.auth_401 + r.auth_403) > 0;
      if (isBad && !openStart) {
        openStart = r.bucket;
      } else if (!isBad && openStart) {
        const minutes = Math.round(
          (new Date(r.bucket).getTime() - new Date(openStart).getTime()) / 60_000,
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
    const resolved = slaIncidents.filter(i => i.minutesToResolve !== null) as Array<{
      minutesToResolve: number;
    }>;
    const open = slaIncidents.length - resolved.length;
    if (resolved.length === 0) {
      return {
        total: slaIncidents.length, resolved: 0, open,
        avgMin: 0, maxMin: 0, p95Min: 0,
      };
    }
    const values = resolved.map(i => i.minutesToResolve).sort((a, b) => a - b);
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
    const total = r.reduce((s, x) => s + Math.max(x.total, x.invalid_signature + x.auth_401 + x.auth_403), 0);
    const pct = total > 0 ? (invalid / total) * 100 : 0;
    const avgInterval = intervalData.length > 0
      ? Math.round(intervalData.reduce((s, x) => s + x.intervaloMin, 0) / intervalData.length)
      : 0;
    return { invalid, total, pct: pct.toFixed(1), avgInterval };
  }, [rows, intervalData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Diagnóstico da instância
            {instance && <code className="text-xs bg-muted px-2 py-0.5 rounded">{instance}</code>}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Eventos totais</div>
                <div className="text-2xl font-bold">{totals.total}</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Inválidos</div>
                <div className="text-2xl font-bold text-destructive">{totals.invalid}</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">% inválido</div>
                <div className="text-2xl font-bold text-warning">{totals.pct}%</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Intervalo médio</div>
                <div className="text-2xl font-bold">{totals.avgInterval}<span className="text-sm ml-1">min</span></div>
              </CardContent></Card>
            </div>

            {/* SLA — tempo até resolver */}
            <Card data-testid="instance-sla-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    SLA de resolução (últimas 24h)
                  </div>
                  {sla.open > 0 ? (
                    <Badge variant="destructive" data-testid="instance-sla-open-badge">
                      {sla.open} aberto{sla.open > 1 ? 's' : ''}
                    </Badge>
                  ) : sla.resolved > 0 ? (
                    <Badge variant="secondary" data-testid="instance-sla-resolved-badge">
                      Tudo resolvido
                    </Badge>
                  ) : (
                    <Badge variant="outline" data-testid="instance-sla-clean-badge">
                      Sem incidentes
                    </Badge>
                  )}
                </div>
                {sla.total === 0 ? (
                  <div className="text-sm text-muted-foreground border border-dashed rounded p-4 text-center">
                    Nenhum incidente detectado no período.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="instance-sla-metrics">
                    <div>
                      <div className="text-xs text-muted-foreground">Incidentes</div>
                      <div className="text-xl font-bold" data-testid="instance-sla-total">{sla.total}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {sla.resolved} resolvido{sla.resolved !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Tempo médio</div>
                      <div className="text-xl font-bold text-primary" data-testid="instance-sla-avg">
                        {sla.avgMin}<span className="text-sm ml-1">min</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">P95</div>
                      <div className="text-xl font-bold text-warning" data-testid="instance-sla-p95">
                        {sla.p95Min}<span className="text-sm ml-1">min</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Pior caso</div>
                      <div className="text-xl font-bold text-destructive" data-testid="instance-sla-max">
                        {sla.maxMin}<span className="text-sm ml-1">min</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Incidente = janela contígua de horas com eventos inválidos. Resolução = primeira hora subsequente sem inválidos.
                </div>
              </CardContent>
            </Card>


            <Card>
              <CardContent className="p-4">
                <div className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-destructive" />
                  % de eventos inválidos por hora
                </div>
                {invalidPctData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded">
                    Sem eventos no período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={invalidPctData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" unit="%" domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area
                        type="monotone" dataKey="invalido" name="% inválido"
                        stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))"
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
                <div className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Timer className="w-4 h-4 text-primary" />
                  Intervalo entre eventos consecutivos (min)
                </div>
                {intervalData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded">
                    Não há eventos suficientes para calcular intervalos.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={intervalData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" unit="m" />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                      <Bar dataKey="intervaloMin" name="Intervalo (min)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
