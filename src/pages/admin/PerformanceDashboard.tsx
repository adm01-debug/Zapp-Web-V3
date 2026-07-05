import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getWebVitalsReport } from "@/lib/web-vitals";
import { Gauge, Zap, Layout, Timer, BarChart3, ShieldCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/layout/AppShell";

export default function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<any[]>([]);
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
      case 'LCP': return <Zap className="w-5 h-5 text-yellow-500" />;
      case 'FID': return <Timer className="w-5 h-5 text-blue-500" />;
      case 'CLS': return <Layout className="w-5 h-5 text-purple-500" />;
      case 'TTFB': return <Timer className="w-5 h-5 text-green-500" />;
      case 'INP': return <Gauge className="w-5 h-5 text-orange-500" />;
      default: return <BarChart3 className="w-5 h-5" />;
    }
  };

  const getMetricColor = (rating: string) => {
    switch (rating) {
      case 'good': return 'text-green-500';
      case 'needs-improvement': return 'text-yellow-500';
      case 'poor': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getProgressColor = (rating: string) => {
    switch (rating) {
      case 'good': return 'bg-green-500';
      case 'needs-improvement': return 'bg-yellow-500';
      case 'poor': return 'bg-red-500';
      default: return 'bg-primary';
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-auto max-h-screen pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Performance & Core Web Vitals</h1>
        <p className="text-muted-foreground">
          Monitoramento em tempo real do desempenho percebido pelo usuário.
          Última atualização: {lastUpdate.toLocaleTimeString()}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m, idx) => (
          <Card key={`${m.name}-${idx}`} className="overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {getMetricIcon(m.name)}
                {m.name}
              </CardTitle>
              <Badge variant={m.rating === 'good' ? 'default' : 'destructive'} className={m.rating === 'good' ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}>
                {m.rating.toUpperCase()}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">
                {m.value.toFixed(m.name === 'CLS' ? 3 : 0)}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  {m.name === 'CLS' ? '' : 'ms'}
                </span>
              </div>
              <Progress 
                value={Math.min((m.value / 4000) * 100, 100)} 
                className="h-1.5" 
                // Custom indicator color handled via CSS if possible or just use default
              />
              <p className="text-xs text-muted-foreground mt-2">
                {m.name === 'LCP' && "Largest Contentful Paint: Tempo para carregar o maior elemento visual."}
                {m.name === 'FID' && "First Input Delay: Tempo de reação à primeira interação."}
                {m.name === 'CLS' && "Cumulative Layout Shift: Estabilidade visual durante o carregamento."}
                {m.name === 'TTFB' && "Time to First Byte: Latência do servidor."}
                {m.name === 'INP' && "Interaction to Next Paint: Responsividade geral da interface."}
              </p>
            </CardContent>
          </Card>
        ))}
        
        {metrics.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
            <p>Aguardando coleta de métricas iniciais...</p>
            <p className="text-xs italic mt-1">Interaja com a página para gerar dados.</p>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
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
