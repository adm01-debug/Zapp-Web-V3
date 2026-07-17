import { queryKeys } from '@/services/api/queryKeys';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.realtimeMonitor() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.failedMessages.all() });
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6 text-primary" />
            Monitoramento em Tempo Real
            <Badge
              variant={isLive ? 'default' : 'outline'}
              className={cn('ml-2', isLive && 'animate-pulse')}
            >
              {isLive ? '● ao vivo' : 'auto-refresh'}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status de conexões, throughput de webhooks e falhas de dispatch agrupadas por agente e
            canal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={windowHours} onValueChange={setWindowHours}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
            <Switch
              id="rtm-auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Alternar atualização automática"
            />
            <Label htmlFor="rtm-auto-refresh" className="cursor-pointer select-none text-xs">
              Auto-refresh
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={handleManualRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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