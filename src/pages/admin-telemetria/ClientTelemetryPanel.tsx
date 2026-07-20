import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Trash2, Gauge } from 'lucide-react';
import { TelemetryStatsCards } from './TelemetryStatsCards';
import { formatDuration, formatTime } from './telemetryUtils';
import {
  getTelemetrySnapshot,
  resetTelemetry,
  type TelemetrySnapshot,
  type Severity,
} from '@/lib/clientTelemetry';

const REFRESH_MS = 2000;

function severityBadge(sev: Severity) {
  switch (sev) {
    case 'very_slow':
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">🔴 Muito Lenta</Badge>;
    case 'slow':
      return <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">🟡 Lenta</Badge>;
    case 'timeout':
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">⏱ Timeout</Badge>;
    case 'error':
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">❌ Erro</Badge>;
    default:
      return <Badge variant="secondary" className="text-[10px]">{sev}</Badge>;
  }
}

/** Client Telemetry Panel. */
export function ClientTelemetryPanel() {
  const [snap, setSnap] = useState<TelemetrySnapshot>(() => getTelemetrySnapshot());

  useEffect(() => {
    const id = window.setInterval(() => setSnap(getTelemetrySnapshot()), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const errorsAndTimeouts = snap.bySeverity.error + snap.bySeverity.timeout;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Gauge className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Telemetria do Cliente</h2>
            <p className="text-sm text-muted-foreground">
              Contadores em memória das chamadas ao FATOR X / proxy (auto-refresh {REFRESH_MS / 1000}s)
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { resetTelemetry(); setSnap(getTelemetrySnapshot()); }}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Limpar contadores
        </Button>
      </div>

      <TelemetryStatsCards
        verySlow={snap.bySeverity.very_slow}
        slow={snap.bySeverity.slow}
        errors={errorsAndTimeouts}
        avgDuration={`${snap.avgDurationMs}ms`}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Eventos Lentos / Erros (últimos {snap.slowEvents.length})
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              p95: {snap.p95DurationMs}ms · total: {snap.total}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {snap.slowEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Nenhum evento lento ou erro registrado</p>
              <p className="text-xs mt-1">Tudo dentro dos limites (slow ≥ 1500ms, very_slow ≥ 4000ms)</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Quando</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Trace ID</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Source</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Op</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Target</th>
                    <th scope="col" className="text-right p-3 font-medium text-muted-foreground">Duração</th>
                    <th scope="col" className="text-right p-3 font-medium text-muted-foreground">Records</th>
                    <th scope="col" className="text-right p-3 font-medium text-muted-foreground">Limit</th>
                    <th scope="col" className="text-right p-3 font-medium text-muted-foreground">Offset</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Severidade</th>
                    <th scope="col" className="text-left p-3 font-medium text-muted-foreground">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snap.slowEvents].reverse().map((ev, idx) => (
                    <tr key={`${ev.startedAt}-${idx}`} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap ">
                        {formatTime(new Date(Date.now() - (performance.now() - ev.startedAt)).toISOString())}
                      </td>
                      <td
                        className="p-3 text-xs  text-primary"
                        title={ev.correlationId ? `Correlation ID: ${ev.correlationId}` : 'sem trace id'}
                      >
                        {ev.correlationId ?? '-'}
                      </td>
                      <td className="p-3 text-xs  text-muted-foreground">{ev.source}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px] ">{ev.operation}</Badge>
                      </td>
                      <td className="p-3  text-xs font-medium truncate max-w-[200px]" title={ev.target}>{ev.target}</td>
                      <td className="p-3 text-right  font-bold tabular-nums">
                        <span className={ev.durationMs >= 4000 ? 'text-destructive' : ev.durationMs >= 1500 ? 'text-warning' : ''}>
                          {formatDuration(ev.durationMs)}
                        </span>
                      </td>
                      <td className="p-3 text-right  text-xs tabular-nums">{ev.recordCount ?? '-'}</td>
                      <td className="p-3 text-right  text-xs tabular-nums text-muted-foreground">{ev.limit ?? '-'}</td>
                      <td className="p-3 text-right  text-xs tabular-nums text-muted-foreground">{ev.offset ?? '-'}</td>
                      <td className="p-3">{severityBadge(ev.severity)}</td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-[200px]" title={ev.errorMessage}>
                        {ev.errorMessage ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
