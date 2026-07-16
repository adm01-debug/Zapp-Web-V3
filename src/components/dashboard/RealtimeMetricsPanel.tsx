import { useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import {
  Activity,
  MessageSquare,
  Users,
  Mail,
  UserPlus,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeDashboard } from '@/hooks/useRealtimeDashboard';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function RealtimeMetricsPanel() {
  const {
    messagesThisHour,
    messagesLastHour,
    messagesPerMinute,
    activeConversationsNow,
    newContactsToday,
    unreadMessages,
    metricsHistory,
    lastMessageAt,
    isConnected,
  } = useRealtimeDashboard();

  const hourChange =
    messagesLastHour > 0
      ? Math.round(((messagesThisHour - messagesLastHour) / messagesLastHour) * 100)
      : messagesThisHour > 0
        ? 100
        : 0;

  const metrics = [
    {
      label: 'Msgs/Hora',
      value: messagesThisHour,
      icon: MessageSquare,
      change: hourChange,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Msgs/Min',
      value: messagesPerMinute,
      icon: Activity,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Conversas Ativas',
      value: activeConversationsNow,
      icon: Users,
      color: 'text-info',
      bg: 'bg-info/10',
    },
    {
      label: 'Não Lidas',
      value: unreadMessages,
      icon: Mail,
      color: unreadMessages > 10 ? 'text-destructive' : 'text-warning',
      bg: unreadMessages > 10 ? 'bg-destructive/10' : 'bg-warning/10',
    },
    {
      label: 'Novos Contatos',
      value: newContactsToday,
      icon: UserPlus,
      color: 'text-secondary',
      bg: 'bg-secondary/10',
    },
  ];

  const { sparkData, maxSpark } = useMemo(() => {
    const data = metricsHistory.slice(-10).map((m) => m.messagesPerMinute);
    return { sparkData: data, maxSpark: Math.max(...data, 1) };
  }, [metricsHistory]);

  return (
    <Card className="overflow-hidden border-primary/20 bg-card">
      <CardHeader className="border-b border-primary/20 bg-primary/5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Activity className="h-4 w-4 text-primary" />
            </motion.div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Métricas em Tempo Real
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {lastMessageAt && (
              <span className="text-xs text-muted-foreground">
                Última msg: {formatDistanceToNow(lastMessageAt, { addSuffix: true, locale: ptBR })}
              </span>
            )}
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5 text-xs font-semibold',
                isConnected
                  ? 'border-success/50 text-success'
                  : 'border-destructive/50 text-destructive'
              )}
            >
              {isConnected ? (
                <motion.div className="relative flex items-center justify-center">
                  <motion.span
                    className="absolute h-3 w-3 rounded-full bg-success/40"
                    animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <Wifi className="relative z-10 h-3 w-3" />
                </motion.div>
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {isConnected ? 'Ao Vivo' : 'Offline'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.04, y: -2 }}
              className="flex cursor-default flex-col items-center rounded-xl border border-border/30 bg-muted/30 p-3 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div
                className={cn(
                  'mb-2 flex h-8 w-8 items-center justify-center rounded-lg',
                  metric.bg
                )}
              >
                <metric.icon className={cn('h-4 w-4', metric.color)} />
              </div>
              <motion.span
                key={metric.value}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="text-xl font-bold text-foreground"
              >
                {metric.value}
              </motion.span>
              <span className="text-center text-xs text-muted-foreground">{metric.label}</span>
              {'change' in metric && metric.change !== undefined && (
                <div
                  className={cn(
                    'mt-1 flex items-center gap-0.5 text-xs',
                    metric.change >= 0 ? 'text-success' : 'text-destructive'
                  )}
                >
                  {metric.change >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(metric.change)}%
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Mini sparkline */}
        {sparkData.length > 1 && (
          <div className="mt-3 flex h-8 items-end gap-1 px-2">
            <span className="mr-2 self-center text-xs text-muted-foreground">Fluxo:</span>
            {sparkData.map((val, i) => (
              <motion.div
                key={`spark-${i}`}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((val / maxSpark) * 100, 8)}%` }}
                className="min-h-[2px] flex-1 rounded-sm bg-primary/60"
                transition={{ delay: i * 0.03 }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
