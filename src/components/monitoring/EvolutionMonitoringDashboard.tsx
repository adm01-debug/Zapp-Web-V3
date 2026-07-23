import { useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, Wifi, Webhook, RefreshCw, Loader2, Stethoscope, Timer, Bell, BellOff, CalendarDays, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEvolutionMonitoring } from './hooks/useEvolutionMonitoring';
import type { TimePeriod } from './hooks/useEvolutionMonitoring';
import { MonitoringStatsCards } from './MonitoringStatsCards';
import { MonitoringMessageChart } from './MonitoringMessageChart';
import { MonitoringConnectionsList } from './MonitoringConnectionsList';
import { MonitoringWebhookPanel } from './MonitoringWebhookPanel';
import { MonitoringHealthLogs } from './MonitoringHealthLogs';
import { MonitoringDiagnosticPanel } from './MonitoringDiagnosticPanel';
import { MonitoringEventTimeline } from './MonitoringEventTimeline';
import { MonitoringAvailabilityHeatmap } from './MonitoringAvailabilityHeatmap';
import { MonitoringSLAPanel } from './MonitoringSLAPanel';

const PERIODS: { value: TimePeriod; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

function StatusSemaphore({ connections }: { connections: { status: string }[] }) {
  const all = connections.length;
  const active = connections.filter(c => c.status === 'connected').length;
  const color = active === all && all > 0 ? 'bg-primary' : active > 0 ? 'bg-warning' : 'bg-destructive';
  const label = active === all && all > 0 ? 'Todas conectadas' : active > 0 ? 'Parcialmente conectado' : 'Sem conexões';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-3 w-3 cursor-default">
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-50', color)} />
          <span className={cn('relative inline-flex rounded-full h-3 w-3', color)} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label} ({active}/{all})</TooltipContent>
    </Tooltip>
  );
}

/** Evolution Monitoring Dashboard component for the monitoring section. */
export function EvolutionMonitoringDashboard() {
  const {
    connections, healthLogs, loading, refreshing, webhookTest, webhookConfig,
    messageStats, reconfiguring, diagnostic, diagnosing, uptime,
    sparklines, instanceUptimes, notificationsEnabled, requestNotifications,
    period, changePeriod, autoRefresh, setAutoRefresh, countdown,
    runHealthCheck, testWebhookDelivery, checkWebhookConfig, reconfigureWebhook,
    runDiagnostic,
  } = useEvolutionMonitoring();

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); runHealthCheck(); }
    if (e.key === '1') changePeriod('1h');
    if (e.key === '2') changePeriod('6h');
    if (e.key === '3') changePeriod('12h');
    if (e.key === '4') changePeriod('24h');
    if (e.key === '5') changePeriod('7d');
  }, [runHealthCheck, changePeriod]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Monitor Evolution</h1>
              <StatusSemaphore connections={connections} />
            </div>
            <p className="text-sm text-muted-foreground">
              Status, webhook e health checks em tempo real
              <span className="hidden sm:inline text-[10px] ml-2 text-muted-foreground/60">[R] health check · [1-5] período</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period Selector */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
            {PERIODS.map(p => (
              <Button
                key={p.value}
                variant="ghost"
                size="sm"
                className={cn('h-7 text-xs px-2.5 rounded-md', period === p.value && 'bg-background shadow-sm')}
                onClick={() => changePeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Auto-refresh */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {autoRefresh ? (
                <span className="tabular-nums w-6 text-center">{countdown}s</span>
              ) : (
                <span>Parado</span>
              )}
            </div>
          </div>

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={notificationsEnabled ? 'Desativar notificações' : 'Ativar notificações'}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={requestNotifications}
              >
                {notificationsEnabled
                  ? <Bell className="w-4 h-4 text-primary" />
                  : <BellOff className="w-4 h-4 text-muted-foreground" />
                }
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {notificationsEnabled ? 'Notificações ativadas' : 'Ativar notificações de desconexão'}
            </TooltipContent>
          </Tooltip>

          <Button onClick={runHealthCheck} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={cn('w-4 h-4 mr-2', refreshing && 'animate-spin')} />
            {refreshing ? 'Verificando...' : 'Health Check'}
          </Button>
        </div>
      </div>

      <MonitoringStatsCards connections={connections} messageStats={messageStats} uptime={uptime} sparklines={sparklines} />

      {/* Chart + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MonitoringMessageChart messageStats={messageStats} period={period} />
        </div>
        <MonitoringEventTimeline />
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="connections"><Wifi className="w-4 h-4 mr-1.5" />Conexões</TabsTrigger>
          <TabsTrigger value="webhook"><Webhook className="w-4 h-4 mr-1.5" />Webhook</TabsTrigger>
          <TabsTrigger value="diagnostic"><Stethoscope className="w-4 h-4 mr-1.5" />Diagnóstico</TabsTrigger>
          <TabsTrigger value="sla"><BarChart3 className="w-4 h-4 mr-1.5" />SLA</TabsTrigger>
          <TabsTrigger value="heatmap"><CalendarDays className="w-4 h-4 mr-1.5" />Heatmap</TabsTrigger>
          <TabsTrigger value="health-logs"><Activity className="w-4 h-4 mr-1.5" />Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          <MonitoringConnectionsList
            connections={connections}
            webhookTest={webhookTest}
            onCheckWebhook={checkWebhookConfig}
            onTestWebhook={testWebhookDelivery}
          />
        </TabsContent>

        <TabsContent value="webhook">
          <MonitoringWebhookPanel
            connections={connections}
            webhookTest={webhookTest}
            webhookConfig={webhookConfig}
            reconfiguring={reconfiguring}
            onTest={testWebhookDelivery}
            onReconfigure={reconfigureWebhook}
            onCheckConfig={checkWebhookConfig}
          />
        </TabsContent>

        <TabsContent value="diagnostic">
          <MonitoringDiagnosticPanel
            diagnostic={diagnostic}
            diagnosing={diagnosing}
            onRunDiagnostic={runDiagnostic}
            onReconfigureWebhook={reconfigureWebhook}
            reconfiguring={reconfiguring}
          />
        </TabsContent>

        <TabsContent value="sla">
          <MonitoringSLAPanel uptime={uptime} instanceUptimes={instanceUptimes} />
        </TabsContent>

        <TabsContent value="heatmap">
          <MonitoringAvailabilityHeatmap healthLogs={healthLogs} />
        </TabsContent>

        <TabsContent value="health-logs">
          <MonitoringHealthLogs healthLogs={healthLogs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
