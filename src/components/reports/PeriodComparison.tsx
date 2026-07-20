import { useState, useEffect } from 'react';
import { fetchConversationClosuresCount } from '@/hooks/usePeriodComparison';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, ArrowRight, BarChart3 } from 'lucide-react';
import { dbFrom } from '@/integrations/datasource/db';

interface PeriodData {
  label: string;
  total: number;
  resolved: number;
  avgResponseTime: number;
}

/** Period Comparison component for the reports section. */
export function PeriodComparison() {
  const [comparison, setComparison] = useState<{
    current: PeriodData;
    previous: PeriodData;
  } | null>(null);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComparison();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadComparison = async () => {
    setLoading(true);
    const now = new Date();
    let currentStart: Date, previousStart: Date, previousEnd: Date;

    if (period === 'week') {
      currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(currentStart.getTime());
      previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(currentStart.getTime());
      previousStart = new Date(previousEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [currentRes, previousRes] = await Promise.all([
      dbFrom('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', currentStart.toISOString())
        .eq('sender', 'contact'),
      dbFrom('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', previousStart.toISOString())
        .lt('created_at', previousEnd.toISOString())
        .eq('sender', 'contact'),
    ]);

    const [currentClosuresCount, previousClosuresCount] = await Promise.all([
      fetchConversationClosuresCount(currentStart.toISOString()),
      fetchConversationClosuresCount(previousStart.toISOString(), previousEnd.toISOString()),
    ]);

    setComparison({
      current: {
        label: period === 'week' ? 'Esta semana' : 'Este mês',
        total: currentRes.count || 0,
        resolved: currentClosuresCount,
        avgResponseTime: 0,
      },
      previous: {
        label: period === 'week' ? 'Semana passada' : 'Mês passado',
        total: previousRes.count || 0,
        resolved: previousClosuresCount,
        avgResponseTime: 0,
      },
    });
    setLoading(false);
  };

  const getVariation = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const VariationBadge = ({
    current,
    previous,
    inverted = false,
  }: {
    current: number;
    previous: number;
    inverted?: boolean;
  }) => {
    const variation = getVariation(current, previous);
    const isPositive = inverted ? variation < 0 : variation > 0;
    return (
      <Badge
        variant="outline"
        className={`text-[10px] ${isPositive ? 'border-success/30 text-success' : variation < 0 ? 'border-destructive/30 text-destructive' : 'text-muted-foreground'}`}
      >
        {isPositive ? (
          <TrendingUp className="mr-0.5 h-3 w-3" />
        ) : (
          <TrendingDown className="mr-0.5 h-3 w-3" />
        )}
        {variation > 0 ? '+' : ''}
        {variation}%
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 animate-pulse rounded-xl bg-muted/20" />
        </CardContent>
      </Card>
    );
  }

  if (!comparison) return null;

  const metrics = [
    {
      label: 'Mensagens recebidas',
      current: comparison.current.total,
      previous: comparison.previous.total,
    },
    {
      label: 'Conversas encerradas',
      current: comparison.current.resolved,
      previous: comparison.previous.resolved,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-primary" />
            Comparativo entre Períodos
          </CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="month">Mensal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <VariationBadge current={m.current} previous={m.previous} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg bg-muted/20 p-2 text-center">
                  <p className="text-lg font-bold">{m.previous}</p>
                  <p className="text-[10px] text-muted-foreground">{comparison.previous.label}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 rounded-lg bg-primary/10 p-2 text-center">
                  <p className="text-lg font-bold text-primary">{m.current}</p>
                  <p className="text-[10px] text-muted-foreground">{comparison.current.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
