// @ts-nocheck
import React, { useMemo, useEffect, useState } from 'react';

interface StsMetricRow {
  voice_preset: string;
  error_rate: number;
  avg_latency_ms: number;
  p99_latency?: number | null;
  latest_error?: string | null;
}
import { getLogger } from '@/lib/logger';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { safeClient } from '@/integrations/supabase/safeClient';
import { QueueMetrics } from '../../hooks/useMessageQueue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Send, AlertCircle, RefreshCcw, Sparkles, Loader2 } from 'lucide-react';

interface QueueMetricsDashboardProps {
  metrics: QueueMetrics;
}

const log = getLogger('QueueMetricsDashboard');
const _COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export const QueueMetricsDashboard: React.FC<QueueMetricsDashboardProps> = React.memo(
  ({ metrics }) => {
    const [stsMetrics, setStsMetrics] = useState<Record<string, unknown>[]>([]);
    const [loadingSts, setLoadingSts] = useState(true);

    useEffect(() => {
      let cancelled = false;
      const fetchSTS = async () => {
        try {
          const { data, error } = await safeClient.from<Record<string, unknown>>(
            'sts_performance_metrics',
            (q) => q.select('*')
          );
          if (!cancelled && !error && data) setStsMetrics(data);
        } catch (err) {
          if (!cancelled) log.error('Failed to fetch STS metrics', err);
        } finally {
          if (!cancelled) setLoadingSts(false);
        }
      };
      fetchSTS();
      return () => {
        cancelled = true;
      };
    }, []);
    const typeData = useMemo(() => {
      return Object.entries(metrics.byType).map(([type, data]) => ({
        name: type.charAt(0).toUpperCase() + type.slice(1),
        sent: data.sent,
        failed: data.failed,
        latency:
          data.latency.length > 0
            ? Math.round(data.latency.reduce((a, b) => a + b, 0) / data.latency.length)
            : 0,
      }));
    }, [metrics]);

    const conversationData = useMemo(() => {
      return Object.entries(metrics.byConversation)
        .map(([id, data]) => ({
          name: id.split('@')[0], // Shorten JID
          sent: data.sent,
          failed: data.failed,
          latency:
            data.latency.length > 0
              ? Math.round(data.latency.reduce((a, b) => a + b, 0) / data.latency.length)
              : 0,
        }))
        .slice(0, 5); // Only top 5
    }, [metrics]);

    const pieData = useMemo(() => {
      return [
        { name: 'Sucesso', value: metrics.totalSent },
        { name: 'Falha', value: metrics.totalFailed },
      ].filter((d) => d.value > 0);
    }, [metrics]);

    return (
      <div className="grid max-h-[80vh] gap-4 overflow-y-auto bg-background p-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enviado</CardTitle>
            <Send className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalSent}</div>
            <p className="text-xs text-muted-foreground">Mensagens confirmadas</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Falhas</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalFailed}</div>
            <p className="text-xs text-muted-foreground">Erros definitivos</p>
          </CardContent>
        </Card>

        <Card className="border-warning/20 bg-warning/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retentativas</CardTitle>
            <RefreshCcw className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalRetries}</div>
            <p className="text-xs text-muted-foreground">Ajustes automáticos</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latência Média</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(metrics.averageLatency)}ms</div>
            <p className="text-xs text-muted-foreground">Tempo médio de envio</p>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold">Volume por Tipo</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis fontSize={10} />
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                <Bar
                  dataKey="sent"
                  name="Sucesso"
                  fill="hsl(var(--success))"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="failed"
                  name="Falha"
                  fill="hsl(var(--destructive))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold">Latência por Tipo (ms)</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis fontSize={10} />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="latency"
                  name="Latência"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold">Taxa de Sucesso</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[200px] items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === 'Sucesso'
                            ? 'hsl(var(--success))'
                            : 'hsl(var(--destructive))'
                        }
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-xs italic text-muted-foreground">Aguardando dados...</span>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold">Top 5 Conversas (ms)</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conversationData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={10} />
                <YAxis dataKey="name" type="category" fontSize={10} width={60} />
                <RechartsTooltip />
                <Bar
                  dataKey="latency"
                  name="Latência"
                  fill="hsl(var(--accent))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* STS Commercial Troubleshooting Section */}
        <Card className="col-span-full border-primary/30 shadow-md">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="h-4 w-4 text-primary" />
              Performance do Voice Changer (STS) - Time Comercial
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loadingSts ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : stsMetrics.length > 0 ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {stsMetrics.slice(0, 3).map((m) => (
                    <div key={m.voice_preset} className="rounded-lg border bg-muted/30 p-3">
                      <div className="mb-2 flex items-start justify-between">
                        <span className="text-xs font-black uppercase tracking-tighter">
                          {m.voice_preset}
                        </span>
                        <Badge
                          variant={m.error_rate > 0.2 ? 'destructive' : 'outline'}
                          className="text-[9px]"
                        >
                          Err: {(m.error_rate * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="opacity-60">Avg:</span>{' '}
                          <strong>{m.avg_latency_ms}ms</strong>
                        </div>
                        <div>
                          <span className="opacity-60">p99:</span>{' '}
                          <strong>{m.p99_latency?.toFixed(0)}ms</strong>
                        </div>
                        <div className="col-span-2 mt-1 truncate italic text-muted-foreground">
                          Last Err: {m.latest_error || 'Nenhum'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stsMetrics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="voice_preset" fontSize={10} />
                      <YAxis fontSize={10} />
                      <RechartsTooltip />
                      <Bar
                        dataKey="total_requests"
                        name="Total"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="failed_requests"
                        name="Falhas"
                        fill="hsl(var(--destructive))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-xs italic text-muted-foreground">
                Sem dados de conversão nas últimas 24h.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
);
QueueMetricsDashboard.displayName = 'QueueMetricsDashboard';
