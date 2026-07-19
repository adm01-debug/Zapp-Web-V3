import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import type { WhatsAppConnection } from '@/features/connections';

interface Props {
  connections: WhatsAppConnection[];
}

const statusVisual = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'connected') return { icon: Wifi, tone: 'success' as const, label: 'Conectado' };
  if (s === 'degraded' || s === 'connecting' || s === 'unstable')
    return { icon: AlertTriangle, tone: 'warning' as const, label: 'Instável' };
  return { icon: WifiOff, tone: 'destructive' as const, label: 'Desconectado' };
};

/** Agents Connections Header component for the agents ops section. */
export function AgentsConnectionsHeader({ connections }: Props) {
  if (!connections || connections.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        Conexões WhatsApp
      </div>
      <div className="flex flex-wrap gap-2">
        {connections.map((c) => {
          const v = statusVisual(c.status);
          const Icon = v.icon;
          const ms = c.health_response_ms;
          return (
            <div
              key={c.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5',
                'text-xs',
              )}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5',
                  v.tone === 'success' && 'text-success',
                  v.tone === 'warning' && 'text-warning',
                  v.tone === 'destructive' && 'text-destructive',
                )}
              />
              <span className="font-medium text-foreground truncate max-w-[140px]">
                {c.instance_id ?? c.name}
              </span>
              <Badge variant={v.tone === 'success' ? 'success' : v.tone === 'warning' ? 'warning' : 'destructive'}>
                {v.label}
              </Badge>
              {typeof ms === 'number' && (
                <span className="text-muted-foreground tabular-nums">{ms}ms</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
