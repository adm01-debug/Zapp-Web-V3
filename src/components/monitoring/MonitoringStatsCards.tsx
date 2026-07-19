import { Card, CardContent } from '@/components/ui/card';
import { Wifi, MessageSquare, Zap, ArrowUpDown, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { ConnectionInfo, MessageStats, UptimeInfo, SparklineData } from './hooks/useEvolutionMonitoring';

interface Props {
  connections: ConnectionInfo[];
  messageStats: MessageStats;
  uptime: UptimeInfo;
  sparklines: SparklineData;
}

function PulseDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
      )}
      <span className={cn(
        'relative inline-flex rounded-full h-2.5 w-2.5',
        active ? 'bg-primary' : 'bg-destructive'
      )} />
    </span>
  );
}

function MiniSparkline({ data, color = 'text-primary' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 24;
  const w = 64;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  // Fill area
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} className="shrink-0" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polygon points={fillPoints} className={cn('opacity-10', color === 'text-primary' ? 'fill-emerald-500' : color === 'text-destructive' ? 'fill-destructive' : 'fill-primary')} />
      <polyline
        points={points}
        fill="none"
        className={cn('stroke-current', color)}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Monitoring Stats Cards component for the monitoring section. */
export function MonitoringStatsCards({ connections, messageStats, uptime, sparklines }: Props) {
  const activeCount = connections.filter(c => c.status === 'connected').length;
  const connWithLatency = connections.filter(c => c.health_response_ms);
  const avgLatency = connWithLatency.length > 0
    ? Math.round(connWithLatency.reduce((s, c) => s + (c.health_response_ms || 0), 0) / connWithLatency.length)
    : null;

  const allOnline = activeCount === connections.length && connections.length > 0;
  const hasIncoming = messageStats.incoming > 0;

  const stats = [
    {
      icon: Wifi,
      iconColor: 'text-primary',
      bgColor: 'bg-primary/10',
      label: 'Conexões Ativas',
      value: `${activeCount}/${connections.length}`,
      subtitle: allOnline ? 'Todas online' : `${connections.length - activeCount} offline`,
      pulse: allOnline,
      sparkline: null as number[] | null,
      sparkColor: 'text-primary',
    },
    {
      icon: Shield,
      iconColor: uptime.percentage >= 99 ? 'text-primary' : uptime.percentage >= 95 ? 'text-warning-foreground' : 'text-destructive',
      bgColor: uptime.percentage >= 99 ? 'bg-primary/10' : uptime.percentage >= 95 ? 'bg-warning/10' : 'bg-destructive/10',
      label: 'Uptime 24h',
      value: `${uptime.percentage}%`,
      subtitle: uptime.totalChecks > 0 ? `${uptime.healthyChecks}/${uptime.totalChecks} checks OK` : 'Sem dados',
      pulse: uptime.percentage >= 99,
      sparkline: sparklines.uptime,
      sparkColor: uptime.percentage >= 95 ? 'text-primary' : 'text-destructive',
    },
    {
      icon: MessageSquare,
      iconColor: 'text-primary',
      bgColor: 'bg-primary/10',
      label: 'Mensagens',
      value: messageStats.total.toLocaleString('pt-BR'),
      subtitle: `↓${messageStats.incoming} ↑${messageStats.outgoing}`,
      pulse: false,
      sparkline: sparklines.messages,
      sparkColor: 'text-primary',
    },
    {
      icon: Zap,
      iconColor: avgLatency && avgLatency < 500 ? 'text-primary' : 'text-warning-foreground',
      bgColor: avgLatency && avgLatency < 500 ? 'bg-primary/10' : 'bg-warning/10',
      label: 'Latência Média',
      value: avgLatency ? `${avgLatency}ms` : '--',
      subtitle: avgLatency && avgLatency < 300 ? 'Excelente' : avgLatency && avgLatency < 800 ? 'Boa' : avgLatency ? 'Lenta' : 'Sem dados',
      pulse: false,
      sparkline: sparklines.latency,
      sparkColor: avgLatency && avgLatency < 500 ? 'text-primary' : 'text-warning-foreground',
    },
    {
      icon: ArrowUpDown,
      iconColor: hasIncoming ? 'text-primary' : 'text-destructive',
      bgColor: hasIncoming ? 'bg-primary/10' : 'bg-destructive/10',
      label: 'Webhook',
      value: hasIncoming ? 'Operacional' : 'Sem Incoming',
      subtitle: hasIncoming ? `${messageStats.incoming} recebidas` : 'Verificar config',
      pulse: hasIncoming,
      sparkline: null,
      sparkColor: 'text-primary',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map(({ icon: Icon, iconColor, bgColor, label, value, subtitle, pulse, sparkline, sparkColor }, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
        >
          <Card className="hover:shadow-md transition-shadow border-border/60 h-full">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-start justify-between mb-2">
                <div className={cn('p-2 rounded-lg', bgColor)}>
                  <Icon className={cn('w-4 h-4', iconColor)} />
                </div>
                <div className="flex items-center gap-1.5">
                  {sparkline && sparkline.length > 1 && (
                    <MiniSparkline data={sparkline} color={sparkColor} />
                  )}
                  {pulse && <PulseDot active />}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
              <p className="text-lg font-bold truncate mt-0.5">{value}</p>
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
