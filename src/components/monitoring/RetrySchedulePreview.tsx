/**
 * Prévia visual do cronograma de tentativas + abort por instância.
 * Lê `RetryConfig` (global e por instância via `loadRetryConfig`) e renderiza
 * a tabela calculada por `simulateRetrySchedule`. É read-only — não muta config.
 *
 * Uso: embarcado no `RetryMetricsPanel`. Aceita `instances` para alimentar o
 * Select; "global" mostra a config base aplicada quando não há override.
 */
import { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Hourglass, Zap, AlertOctagon } from 'lucide-react';
import { loadRetryConfig, DEFAULT_RETRY_CONFIG, type RetryConfig } from '@/lib/retryConfig';
import { simulateRetrySchedule, formatScheduleMs } from '@/lib/retryScheduleSimulation';

interface RetrySchedulePreviewProps {
  instances: string[];
}

const GLOBAL_VALUE = '__global__';

/** Retry Schedule Preview function. */
export function RetrySchedulePreview({ instances }: RetrySchedulePreviewProps) {
  const [selected, setSelected] = useState<string>(GLOBAL_VALUE);
  const [config, setConfig] = useState<RetryConfig>(DEFAULT_RETRY_CONFIG);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRetryConfig(selected === GLOBAL_VALUE ? undefined : selected)
      .then((cfg) => { if (!cancelled) setConfig(cfg); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const schedule = useMemo(() => simulateRetrySchedule(config), [config]);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
            <Hourglass className="w-3 h-3" />
            Cronograma de tentativas e abort
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            Simulação determinística com base na config ativa (jitter ignorado).
          </p>
        </div>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GLOBAL_VALUE}>Global (default)</SelectItem>
            {instances.map((i) => (
              <SelectItem key={i} value={i}>{i}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo da config ativa */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px] ">
          maxRetries: {config.maxRetries}
        </Badge>
        <Badge variant="outline" className="text-[10px] ">
          baseBackoff: {formatScheduleMs(config.baseBackoffMs)}
        </Badge>
        <Badge variant="outline" className="text-[10px] ">
          maxBackoff: {formatScheduleMs(config.maxBackoffMs)}
        </Badge>
        <Badge variant="outline" className="text-[10px] ">
          timeout: {formatScheduleMs(config.timeoutMs)}
        </Badge>
        {loading && (
          <Badge variant="secondary" className="text-[10px]">carregando…</Badge>
        )}
      </div>

      {/* Mini-KPIs */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="rounded border bg-muted/20 px-2 py-1.5">
          <p className="uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
            <Zap className="w-3 h-3" /> Melhor caso
          </p>
          <p className=" mt-0.5">≤ {formatScheduleMs(schedule.bestCaseTotalMs)}</p>
        </div>
        <div className="rounded border bg-muted/20 px-2 py-1.5">
          <p className="uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Backoff total
          </p>
          <p className=" mt-0.5">{formatScheduleMs(schedule.totalBackoffMs)}</p>
        </div>
        <div className="rounded border bg-muted/20 px-2 py-1.5">
          <p className="uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
            <AlertOctagon className="w-3 h-3" /> Pior caso (abort)
          </p>
          <p className=" mt-0.5">{formatScheduleMs(schedule.worstCaseTotalMs)}</p>
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="rounded border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px] text-[10px]">Tentativa</TableHead>
              <TableHead className="text-[10px]">Aguarda antes</TableHead>
              <TableHead className="text-[10px]">Inicia em t+</TableHead>
              <TableHead className="text-[10px]">Abort em t+</TableHead>
              <TableHead className="text-[10px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.attempts.map((a) => (
              <TableRow key={a.attempt}>
                <TableCell className="text-xs ">#{a.attempt}</TableCell>
                <TableCell className="text-xs  text-muted-foreground">
                  {a.delayBeforeMs === 0 ? '—' : formatScheduleMs(a.delayBeforeMs)}
                </TableCell>
                <TableCell className="text-xs ">
                  {formatScheduleMs(a.startAtMs)}
                </TableCell>
                <TableCell className="text-xs ">
                  {formatScheduleMs(a.abortAtMs)}
                </TableCell>
                <TableCell>
                  {a.isFinal ? (
                    <Badge variant="destructive" className="text-[9px]">
                      Última — depois desiste
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px]">
                      Falha → próximo retry
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
