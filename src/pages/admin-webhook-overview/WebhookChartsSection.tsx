import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { openWebhookEventsWithFilters } from '@/lib/webhookEventsDeepLink';
import { categoryFill, type TypeAggregate, type HourlyBucket } from './aggregations';

interface WebhookChartsSectionProps {
  byType: TypeAggregate[];
  hourly: HourlyBucket[];
  hours: string;
  instance: string;
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

/** Webhook Charts Section. */
export function WebhookChartsSection({
  byType,
  hourly,
  hours,
  instance,
}: WebhookChartsSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top eventos por tipo</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Clique numa barra para abrir o log filtrado por esse tipo
            {instance !== 'all' ? ` na instância ${instance}` : ''}.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(220, byType.length * 28)}>
            <BarChart data={byType.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis type="number" tick={{ style: { fontSize: '0.75rem' } }} />
              <YAxis
                type="category"
                dataKey="type"
                tick={{ style: { fontSize: '0.75rem' } }}
                width={150}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="total"
                name="Eventos"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(payload: { type?: string } | undefined) => {
                  const t = payload?.type;
                  if (!t) return;
                  openWebhookEventsWithFilters({
                    eventType: t,
                    instance: instance !== 'all' ? instance : undefined,
                  });
                }}
              >
                {byType.slice(0, 10).map((entry) => (
                  <Cell key={entry.type} fill={categoryFill(entry.type)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Volume por {Number(hours) <= 24 ? 'hora' : 'janela de 6h'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={hourly}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="bucket" tick={{ style: { fontSize: '0.75rem' } }} />
              <YAxis tick={{ style: { fontSize: '0.75rem' } }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="processed"
                name="Processados"
                stackId="1"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.35}
              />
              <Area
                type="monotone"
                dataKey="errored"
                name="Erros"
                stackId="1"
                stroke="hsl(var(--destructive))"
                fill="hsl(var(--destructive))"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
