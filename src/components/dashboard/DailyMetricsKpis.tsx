import { useMemo } from 'react';
import { useDailyMetricsKpis, type DailyMetricRow } from '@/features/dashboard/hooks/useDailyMetricsKpis';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  UserPlus,
  CheckCircle2,
  Users,
  Timer,
} from 'lucide-react';

/**
 * DASHBOARD-03 — KPIs diários.
 *
 * Conecta o painel à view zapp.evolution_daily_metrics (agregado diário mantido
 * por cron no banco — 33+ linhas em produção). Nenhum painel lia esses dados
 * antes; esta é a primeira UI consumidora. Agrega os últimos 7 dias de métricas
 * diárias em cards de KPI (totais do período + último valor pontual onde fizer
 * sentido, ex.: tempo médio de resposta).
 *
 * Sem dados / erro → estado vazio explícito (nunca inventa número).
 */

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="border border-border/60 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

/** Daily KPIs panel — reads zapp.evolution_daily_metrics (DASHBOARD-03). */
export function DailyMetricsKpis() {
  const { data, isLoading, error } = useDailyMetricsKpis();

  const totals = useMemo(() => {
    const rows = data ?? [];
    const sum = (pick: (r: DailyMetricRow) => number | null) =>
      rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    const latest = rows[0];
    return {
      count: rows.length,
      received: sum((r) => r.messages_received),
      sent: sum((r) => r.messages_sent),
      newContacts: sum((r) => r.new_contacts),
      opened: sum((r) => r.conversations_opened),
      resolved: sum((r) => r.conversations_resolved),
      totalContacts: latest?.total_contacts ?? null,
      activeContacts: latest?.active_contacts ?? null,
      avgResponseSeconds: latest?.avg_response_time_seconds ?? null,
      latestDate: latest?.metric_date ?? null,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || totals.count === 0) {
    return (
      <Card className="border border-border/60 bg-card">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <Timer className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">KPIs diários indisponíveis</p>
          <p className="max-w-md text-xs text-muted-foreground/70">
            {error
              ? `Erro ao carregar evolution_daily_metrics: ${error.message}`
              : 'Nenhuma métrica diária registrada ainda (view mantida por cron no banco).'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const periodLabel = totals.latestDate
    ? `Últimos ${totals.count} dia(s) — até ${new Date(totals.latestDate).toLocaleDateString('pt-BR')}`
    : `Últimos ${totals.count} dia(s)`;

  return (
    <Card className="border border-border/60 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-5 w-5 text-primary" />
          KPIs Diários
        </CardTitle>
        <CardDescription className="text-xs">{periodLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            icon={<ArrowDownLeft className="h-4 w-4 text-success" />}
            label="Recebidas"
            value={totals.received.toLocaleString('pt-BR')}
          />
          <KpiCard
            icon={<ArrowUpRight className="h-4 w-4 text-info" />}
            label="Enviadas"
            value={totals.sent.toLocaleString('pt-BR')}
          />
          <KpiCard
            icon={<UserPlus className="h-4 w-4 text-primary" />}
            label="Novos contatos"
            value={totals.newContacts.toLocaleString('pt-BR')}
          />
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            label="Conversas resolvidas"
            value={totals.resolved.toLocaleString('pt-BR')}
          />
          <KpiCard
            icon={<Users className="h-4 w-4 text-warning" />}
            label="Contatos ativos (hoje)"
            value={
              totals.activeContacts != null
                ? totals.activeContacts.toLocaleString('pt-BR')
                : '—'
            }
          />
          <KpiCard
            icon={<Timer className="h-4 w-4 text-muted-foreground" />}
            label="Resp. média (último dia)"
            value={fmtDuration(totals.avgResponseSeconds)}
          />
        </div>
        {totals.totalContacts != null && (
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              Base total: {totals.totalContacts.toLocaleString('pt-BR')} contatos
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {totals.opened.toLocaleString('pt-BR')} conversas abertas no período
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
