import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, XOctagon } from 'lucide-react';
import type { BreachReasonKind, InstanceBreach } from '@/lib/retryAlerts';

interface RetryAlertsBannerProps {
  breaches: InstanceBreach[];
}

const reasonMeta: Record<BreachReasonKind, { icon: typeof TrendingUp; label: string }> = {
  p95: { icon: TrendingUp, label: 'p95 alto' },
  failure_rate: { icon: XOctagon, label: '% falha alta' },
};

/** Retry Alerts Banner component for the monitoring section. */
export function RetryAlertsBanner({ breaches }: RetryAlertsBannerProps) {
  if (breaches.length === 0) return null;

  return (
    <div className="space-y-2" role="region" aria-label="Alertas de retry por instância">
      {breaches.map((b) => {
        const failed = b.metrics.failed + b.metrics.exhausted;
        return (
          <Alert key={b.instance} variant="destructive" className="py-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm flex items-center gap-2 flex-wrap">
              <span>
                Instância <span className="">{b.instance}</span> degradada
              </span>
              {b.hasOverride && (
                <Badge variant="outline" className="text-[10px] border-destructive/40 bg-background/40 font-normal">
                  override próprio
                </Badge>
              )}
            </AlertTitle>
            <AlertDescription className="mt-1.5 space-y-1.5">
              <ul className="flex flex-col gap-1">
                {b.details.map((d) => {
                  const Icon = reasonMeta[d.kind].icon;
                  const suffix = d.kind === 'failure_rate' ? '%' : '';
                  return (
                    <li key={d.kind} className="flex items-center gap-2 text-[11px]">
                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="font-medium">{reasonMeta[d.kind].label}:</span>
                      <span className="">
                        {d.observed}{suffix}
                      </span>
                      <span className="text-muted-foreground/80">
                        (limite {d.threshold}{suffix})
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                {b.metrics.total} runs · sucesso pós-retry: {b.metrics.successAfterRetry} · falhas: {failed}
              </p>
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
