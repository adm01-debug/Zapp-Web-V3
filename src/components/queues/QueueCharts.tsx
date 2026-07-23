import { useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, MessageSquare, Clock, Users } from 'lucide-react';
import { useQueueAnalytics } from '@/hooks/useQueueAnalytics';
import { PeriodSelector, PeriodOption } from './PeriodSelector';
import { TOOLTIP_STYLE, AXIS_PROPS, GRID_PROPS } from './chartConfig';

interface QueueChartsProps {
  queueId: string;
  queueColor: string;
}

function ChartCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
    icon: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`border border-secondary/20 bg-card/50 backdrop-blur ${className || ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Queue Charts component for the queues section. */
export function QueueCharts({ queueId, queueColor }: QueueChartsProps) {
  const [period, setPeriod] = useState<PeriodOption>('7d');
  const [dateRange, setDateRange] = useState(() => ({
    from: subDays(new Date(), 6),
    to: new Date(),
  }));
  const { dailyData, hourlyData, agentPerformance, statusData, loading } = useQueueAnalytics(
    queueId,
    dateRange
  );

  const handlePeriodChange = (newPeriod: PeriodOption, newRange: { from: Date; to: Date }) => {
    setPeriod(newPeriod);
    setDateRange(newRange);
  };

  const percentFormatter = (value: unknown): [string, string] => [`${String(value)}%`, ''];

  if (loading)
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="border border-secondary/20 bg-card/50">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[250px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <PeriodSelector value={period} dateRange={dateRange} onChange={handlePeriodChange} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Mensagens por Dia" icon={MessageSquare}>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorMensagens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={queueColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={queueColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="day" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="mensagens"
                  stroke={queueColor}
                  strokeWidth={2}
                  fill="url(#colorMensagens)"
                  name="Mensagens"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Resolvidos vs Novos" icon={TrendingUp}>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="day" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar
                  dataKey="resolvidos"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  name="Resolvidos"
                />
                <Bar
                  dataKey="novos"
                  fill="hsl(var(--secondary))"
                  radius={[4, 4, 0, 0]}
                  name="Novos"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="Atividade por Hora (Hoje)" icon={Clock} className="lg:col-span-2">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="hora" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="atendimentos"
                  stroke={queueColor}
                  strokeWidth={2}
                  dot={{ fill: queueColor, strokeWidth: 2 }}
                  name="Mensagens"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              Distribuição de Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={percentFormatter}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex justify-center gap-4">
              {statusData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {agentPerformance.length > 0 && (
        <ChartCard
          title={`Performance por Atendente (${period === 'custom' ? 'período selecionado' : `últimos ${period.replace('d', ' dias')}`})`}
          icon={Users}
        >
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentPerformance} layout="vertical">
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" {...AXIS_PROPS} />
                <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={80} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar
                  dataKey="atendimentos"
                  fill={queueColor}
                  radius={[0, 4, 4, 0]}
                  name="Mensagens enviadas"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
