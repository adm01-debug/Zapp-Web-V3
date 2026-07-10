import { useEffect, useState, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { TrendingUp, Clock, AlertTriangle, CheckCircle, BarChart3, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SLADashboardData {
  account_id: string;
  account_email: string;
  total_threads: number;
  unread_threads: number;
  sla_ok: number;
  sla_warning: number;
  sla_breached: number;
  avg_frt_minutes: number | null;
  pending_reply: number;
}

interface EmailSLADashboardProps {
  className?: string;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  tooltip,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Clock;
  color: string;
  tooltip?: string;
}) {
  const card = (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', `bg-${color.split('-')[1]}-500/10`)}>
            <Icon className={cn('h-5 w-5', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return card;
}

function formatMinutes(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function EmailSLADashboard({ className }: EmailSLADashboardProps) {
  const mountedRef = useMountedRef();
  const [data, setData] = useState<SLADashboardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data: rows } = await safeClient.from<SLADashboardData>('v_email_sla_dashboard', (q) => q.select('*'));
    if (mountedRef.current) {
      setData(rows ?? []);
      setLastRefresh(new Date());
      setIsLoading(false);
    }
  }, [mountedRef]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh a cada 2 min
  useEffect(() => {
    const interval = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const totals = data.reduce(
    (acc, row) => ({
      total: acc.total + (row.total_threads ?? 0),
      unread: acc.unread + (row.unread_threads ?? 0),
      ok: acc.ok + (row.sla_ok ?? 0),
      warning: acc.warning + (row.sla_warning ?? 0),
      breached: acc.breached + (row.sla_breached ?? 0),
      pending: acc.pending + (row.pending_reply ?? 0),
    }),
    { total: 0, unread: 0, ok: 0, warning: 0, breached: 0, pending: 0 }
  );

  const avgFrt = data.length > 0
    ? data.reduce((a, r) => a + (r.avg_frt_minutes ?? 0), 0) / data.filter(r => r.avg_frt_minutes != null).length
    : null;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Métricas SLA — Email</h3>
          {data.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {data.length} {data.length === 1 ? 'conta' : 'contas'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            Atualizado {lastRefresh.toLocaleTimeString()}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={isLoading}>
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          title="Total Threads"
          value={totals.total}
          icon={BarChart3}
          color="text-foreground"
          tooltip="Total de threads no inbox"
        />
        <StatCard
          title="Não lidos"
          value={totals.unread}
          icon={AlertTriangle}
          color={totals.unread > 0 ? 'text-warning-foreground' : 'text-muted-foreground'}
          tooltip="Threads com mensagens não lidas"
        />
        <StatCard
          title="No prazo"
          value={totals.ok}
          icon={CheckCircle}
          color="text-primary"
          tooltip="Threads respondidas dentro do SLA"
        />
        <StatCard
          title="Atenção"
          value={totals.warning}
          subtitle="> 80% do prazo"
          icon={TrendingUp}
          color={totals.warning > 0 ? 'text-warning-foreground' : 'text-muted-foreground'}
          tooltip="Threads próximas de violar o SLA"
        />
        <StatCard
          title="Violações"
          value={totals.breached}
          icon={AlertTriangle}
          color={totals.breached > 0 ? 'text-destructive' : 'text-muted-foreground'}
          tooltip="Threads que violaram o SLA"
        />
        <StatCard
          title="Tempo Médio"
          value={formatMinutes(avgFrt)}
          subtitle="1ª resposta"
          icon={Clock}
          color="text-primary"
          tooltip="Tempo médio de primeira resposta (FRT)"
        />
      </div>

      {/* Por conta */}
      {data.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Por conta</p>
          <div className="space-y-2">
            {data.map(row => {
              const slaTotal = row.sla_ok + row.sla_warning + row.sla_breached;
              const okPct    = slaTotal > 0 ? Math.round((row.sla_ok / slaTotal) * 100) : 100;

              return (
                <div key={row.account_id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.account_email}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {row.total_threads} threads · {row.unread_threads} não lidos
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {row.sla_breached > 0 && (
                      <Badge variant="destructive" className="text-[10px] h-4 px-1.5 gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {row.sla_breached}
                      </Badge>
                    )}
                    {row.sla_warning > 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-warning/50 text-warning-foreground">
                        {row.sla_warning}
                      </Badge>
                    )}
                    <span className={cn('text-xs font-semibold tabular-nums',
                      okPct >= 95 ? 'text-primary' :
                      okPct >= 80 ? 'text-warning-foreground' : 'text-destructive'
                    )}>
                      {okPct}% ok
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      FRT: {formatMinutes(row.avg_frt_minutes)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <BarChart3 className="h-8 w-8 opacity-20" />
          <p className="text-sm">Sem dados de SLA</p>
          <p className="text-xs">Conecte uma conta Email para ver as métricas</p>
        </div>
      )}
    </div>
  );
}
