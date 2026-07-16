import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UsageLog {
  id: string;
  function_name: string;
  model: string | null;
  status: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export function AIProviderHealthPanel() {
  const { data: recentLogs = [], isLoading } = useQuery({
    queryKey: queryKeys.aiFeatures.providerHealth(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .eq('function_name', 'ai-proxy')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as UsageLog[];
    },
    refetchInterval: 30000,
  });

  const stats = {
    total: recentLogs.length,
    success: recentLogs.filter((l) => l.status === 'success').length,
    fallback: recentLogs.filter((l) => l.status === 'fallback').length,
    error: recentLogs.filter((l) => l.status === 'error').length,
    avgLatency:
      recentLogs.length > 0
        ? Math.round(
            recentLogs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / recentLogs.length
          )
        : 0,
    totalTokens: recentLogs.reduce((sum, l) => sum + (l.total_tokens || 0), 0),
  };

  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 100;

  const kpis = [
    {
      label: 'Taxa de Sucesso',
      value: `${successRate}%`,
      icon: successRate >= 95 ? CheckCircle : successRate >= 80 ? AlertTriangle : XCircle,
      color:
        successRate >= 95
          ? 'text-primary'
          : successRate >= 80
            ? 'text-warning-foreground'
            : 'text-destructive',
    },
    {
      label: 'Latência Média',
      value: `${stats.avgLatency}ms`,
      icon: Clock,
      color:
        stats.avgLatency < 2000
          ? 'text-primary'
          : stats.avgLatency < 5000
            ? 'text-warning-foreground'
            : 'text-destructive',
    },
    {
      label: 'Fallbacks',
      value: String(stats.fallback),
      icon: AlertTriangle,
      color: stats.fallback === 0 ? 'text-primary' : 'text-warning-foreground',
    },
    {
      label: 'Tokens Usados',
      value:
        stats.totalTokens > 1000
          ? `${(stats.totalTokens / 1000).toFixed(1)}k`
          : String(stats.totalTokens),
      icon: Zap,
      color: 'text-primary',
    },
  ];

  if (isLoading) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3.5 w-3.5 rounded" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Saúde dos Provedores
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            Últimas {stats.total} chamadas
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border/50 bg-card p-3"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <kpi.icon className={cn('h-3.5 w-3.5', kpi.color)} />
                <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
              </div>
              <p className={cn('text-lg font-bold', kpi.color)}>{kpi.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Recent calls log or empty state */}
        {recentLogs.length > 0 ? (
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Chamadas Recentes
            </p>
            {recentLogs.slice(0, 10).map((log) => {
              const providerType =
                ((log.metadata as Record<string, unknown>)?.provider_type as string) ||
                'lovable_ai'; // ignore-audit: Json column narrowed to Record then provider_type narrowed to string
              const isFallback = log.status === 'fallback';
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted/50"
                >
                  {log.status === 'success' ? (
                    <CheckCircle className="h-3 w-3 shrink-0 text-primary" />
                  ) : log.status === 'fallback' ? (
                    <AlertTriangle className="h-3 w-3 shrink-0 text-warning-foreground" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0 text-destructive" />
                  )}
                  <span className="flex-1 truncate text-muted-foreground">
                    {providerType}
                    {isFallback && ' → fallback'}
                  </span>
                  {log.model && (
                    <span className="max-w-[120px] truncate text-[10px] text-muted-foreground/70">
                      {log.model}
                    </span>
                  )}
                  <span className="shrink-0 text-muted-foreground/60">{log.duration_ms}ms</span>
                  <span className="shrink-0 text-muted-foreground/40">
                    {format(new Date(log.created_at), 'HH:mm', { locale: ptBR })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 rounded-2xl bg-primary/5 p-3">
              <Sparkles className="h-8 w-8 text-primary/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Nenhuma chamada registrada</p>
            <p className="mt-1 max-w-[280px] text-xs text-muted-foreground/60">
              As métricas aparecerão aqui assim que funcionalidades de IA forem utilizadas.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
