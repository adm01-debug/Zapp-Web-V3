
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ShieldCheck, 
  ShieldAlert, 
  ShieldOff, 
  RefreshCw, 
  Clock, 
  Database,
  Search,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEmailHealth } from '@/hooks/useGmailHealth';
import { cn } from '@/lib/utils';

/** Email Status Panel component for the gmail section. */
export function EmailStatusPanel() {
  const { health, isLoading, refresh, forceRevalidation } = useEmailHealth();

  if (isLoading && !health) {
    return <div className="p-8 text-center text-muted-foreground">Carregando telemetria do Email...</div>;
  }

  const statusConfig = {
    healthy: { icon: ShieldCheck, color: 'text-success', bg: 'bg-success/10', label: 'Saudável' },
    degraded: { icon: ShieldAlert, color: 'text-warning', bg: 'bg-warning/10', label: 'Degradado' },
    error: { icon: ShieldOff, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Crítico' }
  };

  const currentStatus = health ? statusConfig[health.status] : statusConfig.healthy;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-xl', currentStatus.bg)}>
            <StatusIcon className={cn('w-6 h-6', currentStatus.color)} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Status do Email</h2>
            <p className="text-sm text-muted-foreground">Integridade de Schema e Telemetria de RPCs</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
            Atualizar
          </Button>
          <Button variant="default" size="sm" onClick={forceRevalidation}>
            Forçar Revalidação
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              Validação de Schema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health?.lastValidation ? formatDistanceToNow(new Date(health.lastValidation), { addSuffix: true, locale: ptBR }) : 'Nuca'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Última verificação de tabelas/RPCs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Cache TTL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health?.cacheExpiration ? formatDistanceToNow(new Date(health.cacheExpiration), { addSuffix: true, locale: ptBR }) : 'Expirado'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Tempo até próxima revalidação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4" />
              Taxa de Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health ? Math.round(((health.stats.totalCalls - health.stats.failedCalls) / Math.max(health.stats.totalCalls, 1)) * 100) : 100}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {health?.stats.totalCalls} chamadas · {health?.stats.failedCalls} falhas
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Histórico de Falhas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[300px]">
            {health?.recentFailures && health.recentFailures.length > 0 ? (
              <div className="divide-y divide-border">
                {health.recentFailures.map((failure, i) => (
                  <div key={`${failure.requestId}-${i}`} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className=" text-[10px]">{failure.requestId}</Badge>
                        <Badge variant="secondary" className="uppercase text-[10px]">{failure.operation}</Badge>
                        <span className="text-sm font-semibold">{failure.resource}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(failure.timestamp), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm text-destructive font-medium">{failure.error}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma falha registrada recentemente.
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
