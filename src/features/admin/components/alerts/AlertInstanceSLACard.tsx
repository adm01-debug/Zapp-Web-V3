import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

/** SLAMetrics component for the alerts section. */
export interface SLAMetrics {
  total: number;
  resolved: number;
  open: number;
  avgMin: number;
  maxMin: number;
  p95Min: number;
}

/** Alert Instance SLACard component for the alerts section. */
export function AlertInstanceSLACard({ sla }: { sla: SLAMetrics }) {
  return (
    <Card data-testid="instance-sla-card">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-primary" />
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
          <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhum incidente detectado no período.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="instance-sla-metrics">
            <div>
              <div className="text-xs text-muted-foreground">Incidentes</div>
              <div className="text-xl font-bold" data-testid="instance-sla-total">
                {sla.total}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {sla.resolved} resolvido{sla.resolved !== 1 ? 's' : ''}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tempo médio</div>
              <div className="text-xl font-bold text-primary" data-testid="instance-sla-avg">
                {sla.avgMin}
                <span className="ml-1 text-sm">min</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">P95</div>
              <div className="text-xl font-bold text-warning" data-testid="instance-sla-p95">
                {sla.p95Min}
                <span className="ml-1 text-sm">min</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pior caso</div>
              <div className="text-xl font-bold text-destructive" data-testid="instance-sla-max">
                {sla.maxMin}
                <span className="ml-1 text-sm">min</span>
              </div>
            </div>
          </div>
        )}
        <div className="mt-3 text-[11px] text-muted-foreground">
          Incidente = janela contígua de horas com eventos inválidos. Resolução = primeira hora
          subsequente sem inválidos.
        </div>
      </CardContent>
    </Card>
  );
}
