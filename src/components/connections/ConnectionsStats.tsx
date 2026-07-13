import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { WhatsAppConnection } from '@/features/connections';

interface ConnectionsStatsProps {
  connections: WhatsAppConnection[];
}

export function ConnectionsStats({ connections }: ConnectionsStatsProps) {
  const online = connections.filter((c) => c.status === 'connected').length;
  const needsAction = connections.filter((c) => c.status !== 'connected').length;

  const stats = [
    {
      label: 'Total de Conexões',
      value: connections.length,
      color: 'text-primary',
      sub:
        connections.length +
        ' instância' +
        (connections.length !== 1 ? 's' : '') +
        ' configurada' +
        (connections.length !== 1 ? 's' : ''),
    },
    {
      label: 'Online',
      value: online,
      color: 'text-primary',
      sub: online > 0 ? 'Recebendo mensagens' : 'Nenhuma ativa',
    },
    {
      label: 'Ações necessárias',
      value: needsAction,
      color: needsAction > 0 ? 'text-destructive-foreground' : 'text-primary',
      sub: needsAction > 0 ? 'Precisam reconectar' : 'Tudo funcionando ✔',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <Card className="border border-secondary/20 bg-card">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className={cn('text-3xl font-bold', stat.color)}>{stat.value}</p>
              {stat.sub && <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
