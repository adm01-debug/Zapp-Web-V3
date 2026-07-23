import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getWebVitalsReport } from '@/lib/webVitals';
import type { WebVitalMetric } from '@/lib/webVitals';
import { Gauge, Zap, Layout, Timer, BarChart3, ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
/** Performance Dashboard. */
export default function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<WebVitalMetric[]>([]);
  const [lastUpdate, setLastLastUpdate] = useState(new Date());

  useEffect(() => {
    const update = () => {
      setMetrics(getWebVitalsReport());
      setLastLastUpdate(new Date());
    };
    const interval = setInterval(update, 2000);
    update();
    return () => clearInterval(interval);
  }, []);

  const getMetricIcon = (name: string) => {
    switch (name) {
      case 'LCP':
        return <Zap className="h-5 w-5 text-warning" />;
      case 'FID':
        return <Timer className="h-5 w-5 text-primary" />;
      case 'CLS':
        return <Layout className="h-5 w-5 text-secondary" />;
      case 'TTFB':
        return <Timer className="h-5 w-5 text-success" />;
      case 'INP':
        return <Gauge className="h-5 w-5 text-warning" />;
      default:
        return <BarChart3 className="h-5 w-5" />;
    }
  };

  return (
    <div className="max-h-screen space-y-6 overflow-auto p-6 pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Performance & Core Web Vitals</h1>
        <p className="text-muted-foreground">
          Monitoramento em tempo real do desempenho percebido pelo usuário. Última atualização:{' '}
          {lastUpdate.toLocaleTimeString()}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m, idx) => (
          <Card
            key={`${m.name}-${idx}`}
            className="overflow-hidden border-border/50 shadow-sm transition-shadow hover:shadow-md"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                {getMetricIcon(m.name)}
                {m.name}
              </CardTitle>
              <Badge
                variant={m.rating === 'good' ? 'default' : 'destructive'}
                className={
                  m.rating === 'good' ? 'border-success/20 bg-success/10 text-success' : ''
                }
              >
                {m.rating.toUpperCase()}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="mb-2 text-2xl font-bold">
                {m.value.toFixed(m.name === 'CLS' ? 3 : 0)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {m.name === 'CLS' ? '' : 'ms'}
                </span>
              </div>
              <Progress
                value={Math.min((m.value / 4000) * 100, 100)}
                className="h-1.5"
                // Custom indicator color handled via CSS if possible or just use default
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {m.name === 'LCP' &&
                  'Largest Contentful Paint: Tempo para carregar o maior elemento visual.'}
                {m.name === 'FID' && 'First Input Delay: Tempo de reação à primeira interação.'}
                {m.name === 'CLS' &&
                  'Cumulative Layout Shift: Estabilidade visual durante o carregamento.'}
                {m.name === 'TTFB' && 'Time to First Byte: Latência do servidor.'}
                {m.name === 'INP' &&
                  'Interaction to Next Paint: Responsividade geral da interface.'}
              </p>
            </CardContent>
          </Card>
        ))}

        {metrics.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-12 text-muted-foreground">
            <BarChart3 className="mb-4 h-12 w-12 opacity-20" />
            <p>Aguardando coleta de métricas iniciais...</p>
            <p className="mt-1 text-xs italic">Interaja com a página para gerar dados.</p>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Budget de Performance (CI Gate)
          </CardTitle>
          <CardDescription>
            Limites configurados para o pipeline de integração contínua.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Largest Contentful Paint (LCP)</span>
              <span className="font-mono">&lt; 2500ms</span>
            </div>
            <Progress value={25} className="h-1" />

            <div className="flex items-center justify-between text-sm">
              <span>Cumulative Layout Shift (CLS)</span>
              <span className="font-mono">&lt; 0.100</span>
            </div>
            <Progress value={10} className="h-1" />

            <div className="flex items-center justify-between text-sm">
              <span>Bundle Size (Gzip)</span>
              <span className="font-mono">&lt; 500KB</span>
            </div>
            <Progress value={80} className="h-1" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
