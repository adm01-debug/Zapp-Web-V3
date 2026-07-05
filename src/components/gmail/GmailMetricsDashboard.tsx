import { Mail, Clock, CheckCircle, TrendingUp, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEmailMetrics } from '@/hooks/useGmailMetrics';

interface EmailMetricsDashboardProps {
  accountId: string | null;
  days?:     number;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color = 'text-primary',
  subtitle,
}: {
  label:     string;
  value:     string | number;
  icon:      React.ElementType;
  color?:    string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <Icon className={`h-8 w-8 ${color} opacity-20`} />
        </div>
      </CardContent>
    </Card>
  );
}

function SLABar({ label, value, total, color }: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} ({pct}%)</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmailMetricsDashboard({ accountId, days = 7 }: EmailMetricsDashboardProps) {
  const { summary, slaDash, chartData, isLoading } = useEmailMetrics(accountId, days);

  if (!accountId) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Selecione uma conta Email para ver as métricas
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Carregando métricas...</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Emails Recebidos"
          value={summary?.total_received ?? 0}
          icon={Mail}
          subtitle={`Últimos ${days} dias`}
        />
        <MetricCard
          label="Respondidos"
          value={summary?.total_replied ?? 0}
          icon={CheckCircle}
          color="text-primary"
          subtitle={`${summary?.reply_rate ?? 0}% taxa de resposta`}
        />
        <MetricCard
          label="Tempo Médio de Resposta"
          value={summary?.avg_reply_minutes != null ? `${summary.avg_reply_minutes}min` : 'N/A'}
          icon={Clock}
          color={
            summary?.avg_reply_minutes != null && summary.avg_reply_minutes > 480
              ? 'text-destructive-foreground'
              : summary?.avg_reply_minutes != null && summary.avg_reply_minutes > 384
              ? 'text-warning-foreground'
              : 'text-primary'
          }
          subtitle={summary?.avg_reply_minutes != null ? `${Math.round(summary.avg_reply_minutes / 60)}h ${summary.avg_reply_minutes % 60}min` : undefined}
        />
        <MetricCard
          label="SLA Compliance"
          value={`${summary?.sla_compliance_rate ?? 100}%`}
          icon={TrendingUp}
          color={
            (summary?.sla_compliance_rate ?? 100) >= 95 ? 'text-primary' :
            (summary?.sla_compliance_rate ?? 100) >= 80 ? 'text-warning-foreground' :
            'text-destructive-foreground'
          }
          subtitle={`${summary?.total_sla_met ?? 0} OK / ${summary?.total_sla_breached ?? 0} violados`}
        />
      </div>

      {/* SLA Dashboard */}
      {slaDash && slaDash.total > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              SLA das Threads Ativas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SLABar label="Dentro do prazo" value={slaDash.ok_count} total={slaDash.total} color="bg-primary" />
            <SLABar label="Atenção (>80% do prazo)" value={slaDash.warning_count} total={slaDash.total} color="bg-warning" />
            <SLABar label="SLA Violado" value={slaDash.breached_count} total={slaDash.total} color="bg-destructive" />
            <SLABar label="Respondido no prazo" value={slaDash.met_count} total={slaDash.total} color="bg-primary" />
          </CardContent>
        </Card>
      )}

      {/* Chart diário (simplificado sem Recharts) */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atividade dos últimos {days} dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {chartData.map((d) => {
                const maxVal = Math.max(...chartData.map(c => c.recebidos), 1);
                const h = Math.max((d.recebidos / maxVal) * 100, 4);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center gap-0.5">
                      <div
                        className="w-full bg-primary/20 rounded-t-sm relative overflow-hidden"
                        style={{ height: `${h}%` }}
                      >
                        <div
                          className="absolute bottom-0 w-full bg-primary rounded-t-sm"
                          style={{ height: `${d.recebidos > 0 ? (d.respondidos / d.recebidos) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground">{d.date}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-primary/20 rounded-sm" /> Recebidos
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-primary rounded-sm" /> Respondidos
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sem dados */}
      {!summary?.daily?.length && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-20" />
            Nenhuma métrica disponível para os últimos {days} dias.
            <br />
            As métricas são calculadas automaticamente pelo pg_cron diário.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EmailMetricsDashboard;
