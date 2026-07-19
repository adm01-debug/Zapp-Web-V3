import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { GitCompare } from 'lucide-react';
import { motion } from 'framer-motion';
import { COLORS, TOOLTIP_STYLE } from './reportChartsHelpers';

// ─── Comparison Summary ───
/** Comparison Summary Chart component for the reports section. */
export function ComparisonSummaryChart({
  data,
  isLoading,
}: {
  data: Array<Record<string, unknown>>;
  isLoading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-4 w-4 text-primary" />
            Comparação de Métricas: Atual vs Anterior
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  width={120}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend />
                <Bar
                  dataKey="atual"
                  name="Período Atual"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="anterior"
                  name="Período Anterior"
                  fill="hsl(var(--muted-foreground))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Period Area Chart ───
/** Period Area Chart component for the reports section. */
export function PeriodAreaChart({
  data,
  label,
  dateLabel,
  gradientId,
  color,
  total,
  isLoading,
  variant = 'primary',
}: {
  data: Array<Record<string, unknown>>;
  label: string;
  dateLabel: string;
  gradientId: string;
  color: string;
  total: number;
  isLoading: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Card className={variant === 'primary' ? 'border-primary/30' : 'border-muted-foreground/30'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge
            variant={variant === 'primary' ? 'outline' : 'secondary'}
            className={variant === 'primary' ? 'border-primary/30 bg-primary/20 text-primary' : ''}
          >
            {dateLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[250px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="total"
                stroke={color}
                fill={`url(#${gradientId})`}
                strokeWidth={2}
                name="Total"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div className="mt-3 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">Total:</span>
            <span className="font-bold">{total}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Distribution Pie Chart ───
/** Distribution Pie Chart component for the reports section. */
export function DistributionPieChart({
  data,
  label,
  isLoading,
  colors,
  variant = 'primary',
}: {
  data: Array<{ name: string; value: number }>;
  label: string;
  isLoading: boolean;
  colors?: string[];
  variant?: 'primary' | 'secondary';
}) {
  const finalColors = colors || COLORS;
  return (
    <Card className={variant === 'primary' ? 'border-primary/30' : 'border-muted-foreground/30'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={finalColors[index % finalColors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Agents Chart ───
/** Agents Chart component for the reports section. */
export function AgentsChart({
  data,
  isLoading,
}: {
  data: Array<{ name: string; mensagens: number }>;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mensagens por Agente</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : data.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis
                dataKey="name"
                type="category"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                width={120}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="mensagens" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[400px] items-center justify-center text-muted-foreground">
            Nenhum dado disponível para o período selecionado
          </div>
        )}
      </CardContent>
    </Card>
  );
}
