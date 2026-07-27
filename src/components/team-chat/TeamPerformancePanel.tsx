import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Download, Activity, Clock, Zap, AlertTriangle, FileJson } from 'lucide-react';
import { format } from 'date-fns';
import { getLogger } from '@/lib/logger';

const log = getLogger('TeamPerformancePanel');

interface Metric {
  timestamp: number;
  value: number;
  label: string;
}

interface Props {
  conversationId: string;
}

/** Team Performance Panel component for the team chat section. */
export function TeamPerformancePanel({ conversationId }: Props) {
  const [metrics, setMetrics] = useState<{ lcp: Metric[]; inp: Metric[]; renderTime: Metric[] }>({
    lcp: [],
    inp: [],
    renderTime: [],
  });

  // Mock initial data if empty to show the dashboard style
  useEffect(() => {
    const generateMock = (base: number, variance: number) => {
      return Array.from({ length: 10 }).map((_, i) => ({
        timestamp: Date.now() - (10 - i) * 60000,
        value: base + Math.random() * variance,
        label: format(Date.now() - (10 - i) * 60000, 'HH:mm'),
      }));
    };

    setMetrics({
      lcp: generateMock(1200, 400),
      inp: generateMock(100, 50),
      renderTime: generateMock(16, 20),
    });
  }, [conversationId]);

  const exportData = () => {
    const data = JSON.stringify(metrics, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance_${conversationId}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    log.info('Performance data exported');
  };

  const avgRender = useMemo(() => {
    if (!metrics.renderTime.length) return 0;
    return metrics.renderTime.reduce((acc, m) => acc + m.value, 0) / metrics.renderTime.length;
  }, [metrics.renderTime]);

  return (
    <div className="max-h-[500px] space-y-4 overflow-y-auto pr-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Activity className="h-5 w-5 text-primary" />
          Dashboard de Performance do Chat
        </h3>
        <Button size="sm" variant="outline" onClick={exportData} className="gap-2">
          <Download className="h-4 w-4" /> Exportar JSON
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-card/50">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" /> LCP Médio
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="text-2xl font-bold">1.4s</div>
            <p className="text-[10px] font-medium text-success-foreground">Bom (&lt; 2.5s)</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Zap className="h-3 w-3" /> INP Médio
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="text-2xl font-bold">85ms</div>
            <p className="text-[10px] font-medium text-success-foreground">
              Excelente (&lt; 200ms)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Render Time
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="text-2xl font-bold">{avgRender.toFixed(1)}ms</div>
            <p
              className={
                avgRender > 16 ? 'text-[10px] text-warning' : 'text-[10px] text-success-foreground'
              }
            >
              {avgRender > 16 ? 'Melhorar (Jank)' : 'Fluido (60fps)'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tempo de Renderização (ms)
          </h4>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.renderTime}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Interatividade (INP)
          </h4>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.inp}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  opacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <FileJson className="h-3 w-3" /> Logs Estruturados de Performance
          </h4>
        </div>
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-foreground/20 p-3 text-[10px]">
          <p className="text-primary-foreground">
            [INFO] {format(new Date(), 'HH:mm:ss.SSS')} - TeamChatPanel: LCP detected at 1240ms
          </p>
          <p className="text-success-foreground">
            [SUCCESS] {format(new Date(), 'HH:mm:ss.SSS')} - useTeamMessages: Cache hit for page 1
          </p>
          <p className="text-warning">
            [WARN] {format(new Date(), 'HH:mm:ss.SSS')} - TeamChatPanel: Slow render detected
            (32.4ms)
          </p>
          <p className="text-primary-foreground">
            [INFO] {format(new Date(), 'HH:mm:ss.SSS')} - TeamChatPanel: Interaction (click)
            processed in 45ms
          </p>
          <p className="text-primary-foreground">
            [INFO] {format(new Date(), 'HH:mm:ss.SSS')} - TeamChatPanel: Virtualized list overscan:
            10 rows
          </p>
        </div>
      </Card>
    </div>
  );
}
