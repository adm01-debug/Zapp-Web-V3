import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Users, CheckCircle2, XCircle, Zap, Target } from 'lucide-react';
import type { TalkXCampaign } from '@/hooks/useTalkX';

interface Props {
  campaigns: TalkXCampaign[];
}

const _COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

/** Talk XAnalytics component for the talkx section. */
export function TalkXAnalytics({ campaigns }: Props) {
  const stats = useMemo(() => {
    const total = campaigns.length;
    const totalSent = campaigns.reduce((a, c) => a + c.sent_count, 0);
    const totalFailed = campaigns.reduce((a, c) => a + c.failed_count, 0);
    const totalRecipients = campaigns.reduce((a, c) => a + c.total_recipients, 0);
    const completed = campaigns.filter((c) => c.status === 'completed').length;
    const avgSuccessRate =
      totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0;

    return { total, totalSent, totalFailed, totalRecipients, completed, avgSuccessRate };
  }, [campaigns]);

  // Status distribution for pie chart
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    campaigns.forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    const statusLabels: Record<string, string> = {
      draft: 'Rascunho',
      scheduled: 'Agendada',
      sending: 'Enviando',
      paused: 'Pausada',
      completed: 'Concluída',
      cancelled: 'Cancelada',
    };
    return Object.entries(counts).map(([status, count]) => ({
      name: statusLabels[status] || status,
      value: count,
    }));
  }, [campaigns]);

  // Per-campaign bar chart data (last 10 completed/sent)
  const barData = useMemo(() => {
    return campaigns
      .filter((c) => c.sent_count > 0 || c.failed_count > 0)
      .slice(0, 10)
      .map((c) => ({
        name: c.name.length > 15 ? c.name.slice(0, 15) + '…' : c.name,
        Enviadas: c.sent_count,
        Falhas: c.failed_count,
      }));
  }, [campaigns]);

  const pieColors = [
    'hsl(var(--primary))',
    'hsl(var(--muted-foreground))',
    'hsl(var(--destructive))',
    'hsl(var(--accent-foreground))',
    'hsl(var(--warning))',
    'hsl(var(--secondary))',
  ];

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <BarChart3 className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nenhuma campanha para analisar</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {[
          { label: 'Campanhas', value: stats.total, icon: Zap, cls: 'text-primary' },
          { label: 'Concluídas', value: stats.completed, icon: CheckCircle2, cls: 'text-primary' },
          {
            label: 'Total Enviadas',
            value: stats.totalSent,
            icon: TrendingUp,
            cls: 'text-primary',
          },
          {
            label: 'Total Falhas',
            value: stats.totalFailed,
            icon: XCircle,
            cls: 'text-destructive',
          },
          {
            label: 'Destinatários',
            value: stats.totalRecipients,
            icon: Users,
            cls: 'text-muted-foreground',
          },
          {
            label: 'Taxa Sucesso',
            value: `${stats.avgSuccessRate}%`,
            icon: Target,
            cls: 'text-primary',
          },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="flex flex-col items-center gap-1 p-3">
              <Icon className={`h-4 w-4 ${cls}`} />
              <p className="text-lg font-bold text-foreground">{value}</p>
              <p className="text-center text-[10px] text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* Bar Chart - Per Campaign Performance */}
        {barData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-primary" />
                Desempenho por Campanha
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" tick={{ style: { fontSize: '0.75rem' } }} className="fill-muted-foreground" />
                  <YAxis tick={{ style: { fontSize: '0.75rem' } }} className="fill-muted-foreground" />
                  <ReTooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="Enviadas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Falhas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Pie Chart - Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ strokeWidth: 1 }}
                >
                  {statusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <ReTooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}