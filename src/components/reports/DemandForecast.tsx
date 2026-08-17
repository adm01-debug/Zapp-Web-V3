import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Clock } from 'lucide-react';
import { format, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('DemandForecast');

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HISTORY_DAYS = 28;
const FORECAST_DAYS = 7;

interface ForecastRow {
  d: string;
  kind: 'actual' | 'forecast';
  dow: number;
  value: number;
}

interface HeatmapCell {
  day: number;
  hour: number;
  value: number;
  sample_count: number;
  total_rows: number;
}

/** Demand Forecast component for the reports section. */
export function DemandForecast() {
  const [historicalData, setHistoricalData] = useState<
    { day: string; actual: number; predicted: number }[]
  >([]);
  const [peakHours, setPeakHours] = useState<{ hour: number; avg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadForecast = useCallback(async () => {
    setLoading(true);
    try {
      // Contagem exata no DB (RPCs agregadas) — substitui a amostra arbitrária
      // .limit(1000) sem orderBy do fetchContactMessagesForHeatmap.
      const [forecastRes, heatmapRes] = await Promise.all([
        supabase.rpc('fn_demand_forecast', { p_days: HISTORY_DAYS, p_forecast_days: FORECAST_DAYS }),
        supabase.rpc('fn_dashboard_heatmap', { p_metric: 'volume', p_days: HISTORY_DAYS }),
      ]);
      if (forecastRes.error) {
        log.error('fn_demand_forecast:', forecastRes.error);
        setLoading(false);
        return;
      }
      if (heatmapRes.error) {
        log.warn('fn_dashboard_heatmap (picos):', heatmapRes.error);
      }

      // Série real (últimos 7 dias) × previsto (próximos 7 dias) — tudo derivado de dados.
      const rows = (forecastRes.data ?? []) as ForecastRow[];
      const actual = rows
        .filter((r) => r.kind === 'actual')
        .sort((a, b) => a.d.localeCompare(b.d));
      const forecast = rows
        .filter((r) => r.kind === 'forecast')
        .sort((a, b) => a.d.localeCompare(b.d));
      const fmtDay = (iso: string) =>
        format(new Date(`${iso}T12:00:00`), 'EEE dd/MM', { locale: ptBR });

      setHistoricalData([
        ...actual.map((r) => ({ day: fmtDay(r.d), actual: Math.round(Number(r.value)), predicted: 0 })),
        ...forecast.map((r) => ({ day: fmtDay(r.d), actual: 0, predicted: Math.round(Number(r.value)) })),
      ]);

      // Horários de pico: média real por hora (volume 28d) — sem aleatoriedade.
      const cells = (heatmapRes.data ?? []) as HeatmapCell[];
      const hourTotals = new Map<number, number>();
      for (const c of cells) {
        hourTotals.set(c.hour, (hourTotals.get(c.hour) ?? 0) + Number(c.value));
      }
      const peaks = [...hourTotals.entries()]
        .map(([hour, total]) => ({ hour, avg: Math.round(total / HISTORY_DAYS) }))
        .sort((a, b) => b.avg - a.avg);
      setPeakHours(peaks);
    } catch (err) {
      log.error('loadForecast:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const topPeaks = peakHours.slice(0, 5);
  const totalPredicted = historicalData.reduce((s, d) => s + d.predicted, 0);
  const hasData = historicalData.length > 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-48 animate-pulse rounded-xl bg-muted/20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          Previsão de Demanda (7 dias)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <p className="text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-primary/5 p-2 text-center">
                <p className="text-lg font-bold text-primary">{totalPredicted}</p>
                <p className="text-[10px] text-muted-foreground">Msgs previstas</p>
              </div>
              <div className="rounded-lg bg-warning/5 p-2 text-center">
                <p className="text-lg font-bold text-warning">{topPeaks[0]?.hour ?? '-'}h</p>
                <p className="text-[10px] text-muted-foreground">Hora de pico</p>
              </div>
              <div className="rounded-lg bg-muted/10 p-2 text-center">
                <p className="text-lg font-bold">{DAYS[getDay(new Date())]}</p>
                <p className="text-[10px] text-muted-foreground">Dia atual</p>
              </div>
            </div>

            {/* Chart */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/20" />
                  <XAxis
                    dataKey="day"
                    tick={{ style: { fontSize: '0.75rem' } }}
                    className="fill-muted-foreground"
                  />
                  <YAxis tick={{ style: { fontSize: '0.75rem' } }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="actual"
                    fill="hsl(var(--muted-foreground))"
                    opacity={0.4}
                    radius={[4, 4, 0, 0]}
                    name="Real"
                  />
                  <Bar
                    dataKey="predicted"
                    fill="hsl(var(--primary))"
                    opacity={0.6}
                    radius={[4, 4, 0, 0]}
                    name="Previsto"
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Tendência"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Peak hours */}
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Clock className="h-3.5 w-3.5" /> Horários de pico
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topPeaks.map((p) => (
                  <Badge key={p.hour} variant="outline" className="text-[10px]">
                    {String(p.hour).padStart(2, '0')}h — ~{p.avg} msg/dia
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
