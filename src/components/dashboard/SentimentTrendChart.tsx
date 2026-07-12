import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Smile, Calendar, Download, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Area, AreaChart, Legend, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useRealSentimentData, SentimentStatsCards, SentimentCustomTooltip,
  type SentimentData,
} from './SentimentHelpers';

interface SentimentTrendChartProps {
  data?: SentimentData[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onExport?: () => void;
}

export function SentimentTrendChart({ data: externalData, isLoading, onRefresh, onExport }: SentimentTrendChartProps) {
  const [period, setPeriod] = useState<'7' | '14' | '30'>('14');
  const realSentimentData = useRealSentimentData(parseInt(period));
  const data = useMemo(() => externalData || realSentimentData || [], [externalData, realSentimentData]);

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const avgScore = data.reduce((acc, d) => acc + d.avg_score, 0) / data.length;
    const totalAlerts = data.reduce((acc, d) => acc + d.alerts_count, 0);
    const avgPositive = data.reduce((acc, d) => acc + d.positive, 0) / data.length;
    const avgNegative = data.reduce((acc, d) => acc + d.negative, 0) / data.length;
    const recent = data.slice(-3);
    const previous = data.slice(-6, -3);
    const recentAvg = recent.reduce((acc, d) => acc + d.avg_score, 0) / recent.length;
    const previousAvg = previous.length > 0 ? previous.reduce((acc, d) => acc + d.avg_score, 0) / previous.length : recentAvg;
    return { avgScore, totalAlerts, avgPositive, avgNegative, recentAvg, previousAvg };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Smile className="w-5 h-5 text-primary" />Tendência de Sentimento
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as '7' | '14' | '30')}>
              <SelectTrigger className="w-32"><Calendar className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
              </SelectContent>
            </Select>
            {onRefresh && <Button aria-label="Atualizar gráfico" variant="ghost" size="icon" onClick={onRefresh}><RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} /></Button>}
            {onExport && <Button aria-label="Exportar dados" variant="ghost" size="icon" onClick={onExport}><Download className="w-4 h-4" /></Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats && <SentimentStatsCards stats={stats} />}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={(date) => format(new Date(date), 'dd/MM', { locale: ptBR })} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tickFormatter={(value) => `${value}%`} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <RechartsTooltip content={<SentimentCustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="positive" name="Positivo" stroke="hsl(var(--success))" fill="url(#positiveGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="negative" name="Negativo" stroke="hsl(var(--destructive))" fill="url(#negativeGradient)" strokeWidth={2} />
              <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" label={{ value: 'Meta', position: 'right', fill: 'hsl(var(--muted-foreground))' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
