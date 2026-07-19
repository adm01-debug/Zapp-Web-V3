import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { HealthLog } from './hooks/useEvolutionMonitoring';

interface Props {
  healthLogs: HealthLog[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = 7;
const HEALTHY = ['connected', 'healthy'];

function getCellColor(ratio: number, total: number): string {
  if (total === 0) return 'bg-muted/30';
  if (ratio >= 0.95) return 'bg-primary';
  if (ratio >= 0.8) return 'bg-primary';
  if (ratio >= 0.5) return 'bg-warning';
  if (ratio >= 0.2) return 'bg-warning';
  return 'bg-destructive';
}

/** Monitoring Availability Heatmap component for the monitoring section. */
export function MonitoringAvailabilityHeatmap({ healthLogs }: Props) {
  const { grid, overallUptime, dayLabels } = useMemo(() => {
    const now = new Date();
    const cells: { total: number; healthy: number; ratio: number; date: Date; hour: number }[][] = [];
    const labels: string[] = [];

    for (let d = DAYS - 1; d >= 0; d--) {
      const day = subDays(now, d);
      labels.push(format(day, 'EEE dd/MM', { locale: ptBR }));
      const row: typeof cells[0] = [];

      for (const h of HOURS) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0);
        const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 59, 59);
        const logsInSlot = healthLogs.filter(l => {
          const t = new Date(l.checked_at);
          return t >= start && t <= end;
        });
        const healthyCount = logsInSlot.filter(l => HEALTHY.includes(l.status)).length;
        row.push({
          date: start,
          hour: h,
          total: logsInSlot.length,
          healthy: healthyCount,
          ratio: logsInSlot.length > 0 ? healthyCount / logsInSlot.length : -1,
        });
      }
      cells.push(row);
    }

    const totalAll = healthLogs.length;
    const healthyAll = healthLogs.filter(l => HEALTHY.includes(l.status)).length;
    const up = totalAll > 0 ? Math.round((healthyAll / totalAll) * 1000) / 10 : 100;

    return { grid: cells, overallUptime: up, dayLabels: labels };
  }, [healthLogs]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Disponibilidade 7 Dias
            </CardTitle>
            <CardDescription>Mapa de calor por hora — verde = operacional</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-sm font-bold',
              overallUptime >= 99 ? 'text-primary border-primary/30' :
              overallUptime >= 95 ? 'text-warning-foreground border-warning/30' : 'text-destructive border-destructive/30'
            )}
          >
            {overallUptime}% uptime
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="flex gap-px mb-1 ml-[100px]">
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground tabular-nums">
                  {h % 3 === 0 ? `${h.toString().padStart(2, '0')}h` : ''}
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {grid.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-px mb-px">
                <div className="w-[100px] text-[11px] text-muted-foreground truncate pr-2 text-right capitalize">
                  {dayLabels[dayIdx]}
                </div>
                {row.map((cell, hIdx) => (
                  <Tooltip key={hIdx}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex-1 h-5 rounded-[3px] transition-colors cursor-default',
                          cell.total === 0 ? 'bg-muted/20' : getCellColor(cell.ratio, cell.total)
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">
                        {format(cell.date, 'EEEE dd/MM', { locale: ptBR })} às {cell.hour}h
                      </p>
                      {cell.total > 0 ? (
                        <p className="text-muted-foreground">
                          {cell.healthy}/{cell.total} checks OK ({Math.round(cell.ratio * 100)}%)
                        </p>
                      ) : (
                        <p className="text-muted-foreground">Sem verificações</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 ml-[100px]">
              <span className="text-[10px] text-muted-foreground">Menos</span>
              {['bg-muted/20', 'bg-destructive', 'bg-warning', 'bg-warning', 'bg-primary', 'bg-primary'].map((c, i) => (
                <div key={`${c}-${i}`} className={cn('w-3 h-3 rounded-sm', c)} />
              ))}
              <span className="text-[10px] text-muted-foreground">Mais</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
