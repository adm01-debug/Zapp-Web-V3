/**
 * Admin: Realtime monitoring page.
 * Single consolidated dashboard with connection status, webhook event volume
 * and dispatch errors grouped by agent and channel — auto-updating.
 */
import { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { ConnectionsHealthBlock } from './admin-realtime-monitor/ConnectionsHealthBlock';
import { EventsLiveBlock } from './admin-realtime-monitor/EventsLiveBlock';
import { DispatchErrorsBlock } from './admin-realtime-monitor/DispatchErrorsBlock';
import { EvolutionFallbackStatusCard } from '@/features/admin';
import { useRealtimeMonitor } from '@/hooks/useRealtimeMonitor';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { cn } from '@/lib/utils';

const WINDOW_OPTIONS = [
  { value: '0.25', label: 'Últimos 15min' },
  { value: '1', label: 'Última hora' },
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
] as const;

export default function AdminRealtimeMonitorPage() {
  const [windowHours, setWindowHours] = useState<string>('1');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const queryClient = useQueryClient();
  const { lastEventAt } = useRealtimeMonitor(autoRefresh);

  const isLive = autoRefresh && lastEventAt !== null && Date.now() - lastEventAt < 30_000;

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['realtime-monitor'] });
    queryClient.invalidateQueries({ queryKey: ['failed-messages'] });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Monitoramento em Tempo Real
            <Badge
              variant={isLive ? 'default' : 'outline'}
              className={cn('ml-2', isLive && 'animate-pulse')}
            >
              {isLive ? '● ao vivo' : 'auto-refresh'}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status de conexões, throughput de webhooks e falhas de dispatch agrupadas por agente e canal.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={windowHours} onValueChange={setWindowHours}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/30">
            <Switch
              id="rtm-auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Alternar atualização automática"
            />
            <Label htmlFor="rtm-auto-refresh" className="text-xs cursor-pointer select-none">
              Auto-refresh
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={handleManualRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SectionErrorBoundary sectionName="ConnectionsHealth">
            <ConnectionsHealthBlock />
          </SectionErrorBoundary>
        </div>
        <div>
          <SectionErrorBoundary sectionName="EvolutionFallback">
            <EvolutionFallbackStatusCard />
          </SectionErrorBoundary>
        </div>
      </div>

      <SectionErrorBoundary sectionName="EventsLive">
        <EventsLiveBlock windowHours={Number(windowHours)} autoRefresh={autoRefresh} />
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="DispatchErrors">
        <DispatchErrorsBlock windowHours={Number(windowHours)} />
      </SectionErrorBoundary>
    </div>
  );
}
