/**
 * IdempotencyMissBanner — admin-only visual badge for the Evolution send
 * cache health on the Connections page. Renders nothing for non-admins or
 * when no instance has crossed the threshold in the last hour.
 *
 * The matching warroom alert (toast + push) is raised by the same hook,
 * so this banner is a quiet "context" surface — it answers *which* instance
 * is misbehaving without requiring the admin to open the war room. It also
 * shows the per-instance toast count fired in the current hour bucket and a
 * live countdown to the next reset.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useIdempotencyMissAlerts } from '@/features/admin';

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 1) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

function formatBucketTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

/** Idempotency Miss Banner function. */
export function IdempotencyMissBanner() {
  const {
    counts,
    threshold,
    enabled,
    toastsByInstance,
    nextResetAt,
  } = useIdempotencyMissAlerts();

  // Tick every 30s so the countdown stays fresh without thrashing renders.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const breaching = counts.filter((c) => c.overThreshold);
  const totalToasts = Object.values(toastsByInstance).reduce((s, n) => s + n, 0);

  // Show the banner if either a breach is active OR we already fired toasts in
  // this window (so the operator can see "X toasts disparados, reseta em Y").
  if (breaching.length === 0 && totalToasts === 0) return null;

  const msToReset = Math.max(0, nextResetAt - Date.now());

  return (
    <Card
      role="alert"
      aria-live="polite"
      className="border-warning/40 bg-warning/5"
    >
      <CardContent className="p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5 text-warning shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">
              Cache de idempotência sob pressão
            </p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              última hora
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] gap-1 "
              title={`Próximo reset às ${formatBucketTime(nextResetAt)}`}
            >
              <Clock className="w-3 h-3" aria-hidden />
              reseta em {formatCountdown(msToReset)}
            </Badge>
          </div>

          {breaching.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {breaching.length === 1
                ? `1 instância ultrapassou o limite de ${threshold} cache misses/hora.`
                : `${breaching.length} instâncias ultrapassaram o limite de ${threshold} cache misses/hora.`}{' '}
              Isso pode indicar TTL curto, rotação de chaves ou DLQ replays.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nenhuma instância ativa acima do limite agora — exibindo o resumo de toasts já
              enviados nesta janela.
            </p>
          )}

          {breaching.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {breaching.map((item) => (
                <Badge
                  key={item.instance}
                  variant="destructive"
                  className=" text-xs"
                  title={`${item.count} idempotency_miss em ${item.instance}`}
                >
                  {item.instance} · {item.count}
                </Badge>
              ))}
            </div>
          )}

          {totalToasts > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 pt-1 border-t border-warning/20 mt-2"
              data-testid="toast-counts-row"
            >
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <BellRing className="w-3 h-3" aria-hidden />
                Toasts nesta janela:
              </span>
              {Object.entries(toastsByInstance)
                .sort(([, a], [, b]) => b - a)
                .map(([instance, n]) => (
                  <Badge
                    key={instance}
                    variant="secondary"
                    className=" text-[11px]"
                    title={`${n} toast(s) disparado(s) para ${instance} desde ${formatBucketTime(
                      nextResetAt - 60 * 60 * 1000,
                    )}`}
                  >
                    {instance} · {n}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
