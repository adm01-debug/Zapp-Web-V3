import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Clock, Gauge } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sparkline } from '@/components/ui/sparkline';
import type { InstanceLiveStatus, LatencyStats } from './instanceAggregations';

interface InstanceStatusCardsProps {
  instance: string | null;
  status: InstanceLiveStatus;
  latency: LatencyStats;
  isLoading?: boolean;
}

/** Instance Status Cards. */
export function InstanceStatusCards({
  instance,
  status,
  latency,
  isLoading,
}: InstanceStatusCardsProps) {
  const scope = instance ?? 'todas as instâncias';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Last event */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Último evento — {scope}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : status.lastEvent ? (
            <>
              <div className="text-lg font-semibold">
                {formatDistanceToNow(new Date(status.lastEvent.createdAt), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </div>
              <div className="text-xs text-muted-foreground mt-1  truncate">
                {status.lastEvent.type}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Nenhum evento na janela</div>
          )}
        </CardContent>
      </Card>

      {/* Last 5 minutes + sparkline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Últimos 5 min
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-bold">{status.recentTotal}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="text-success">{status.recentProcessed} ok</span>
                  {' · '}
                  <span className={status.recentErrored > 0 ? 'text-destructive' : ''}>
                    {status.recentErrored} erro
                  </span>
                </div>
              </div>
              <Sparkline
                data={status.sparkline}
                color={
                  status.recentErrored > 0
                    ? 'hsl(var(--destructive))'
                    : 'hsl(var(--primary))'
                }
                width={100}
                height={36}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latency */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Latência (1h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : latency.avgMs === null ? (
            <div className="text-sm text-muted-foreground">Sem amostras processadas</div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{formatMs(latency.avgMs)}</div>
                <Badge variant={latency.avgMs > 2000 ? 'destructive' : 'success'}>
                  {latency.avgMs > 2000 ? 'lenta' : 'ok'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                p95 {formatMs(latency.p95Ms ?? 0)} · {latency.samples} amostras
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
