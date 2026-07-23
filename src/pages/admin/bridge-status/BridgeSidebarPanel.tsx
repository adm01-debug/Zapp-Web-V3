import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { SystemIncident, ActiveAlert } from '../useBridgeStatus';

interface BridgeSidebarPanelProps {
  incidents: SystemIncident[];
  activeAlerts: ActiveAlert[];
}

/** Bridge Sidebar Panel. */
export function BridgeSidebarPanel({ incidents, activeAlerts }: BridgeSidebarPanelProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Histórico de Incidentes
          </CardTitle>
        </CardHeader>
        <CardContent className="scrollbar-thin max-h-[400px] space-y-4 overflow-y-auto pr-2">
          {incidents.length > 0 ? (
            incidents.map((inc) => (
              <div key={inc.id} className="relative border-l border-muted pb-4 pl-6 last:pb-0">
                <div
                  className={cn(
                    'absolute left-[-5px] top-1 h-2 w-2 rounded-full',
                    inc.resolved_at ? 'bg-success' : 'bg-destructive'
                  )}
                />
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase">{inc.title}</span>
                    <Badge
                      variant={inc.status === 'offline' ? 'destructive' : 'warning'}
                      className="h-4 px-1 text-[8px]"
                    >
                      {inc.status}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-[10px] text-muted-foreground">
                    {inc.description}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-[9px] text-muted-foreground">
                    <span>
                      {formatDistanceToNow(new Date(inc.started_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                    {inc.resolved_at ? (
                      <span className="font-medium text-success">Resolvido</span>
                    ) : (
                      <span className="animate-pulse font-medium text-destructive">Ativo</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
              <CheckCircle2 className="mb-2 h-10 w-10" />
              <p className="text-xs">Nenhum incidente registrado</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-warning" /> Alertas Ativos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeAlerts.length > 0 ? (
            activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded border-l-2 border-warning bg-muted/50 p-2 text-[11px]"
              >
                <p className="font-bold">{alert.title}</p>
                <p className="line-clamp-1 opacity-70">{alert.alert_type}</p>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center opacity-50">
              <CheckCircle2 className="mb-2 h-8 w-8" />
              <p className="text-xs">Nenhum incidente crítico</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
