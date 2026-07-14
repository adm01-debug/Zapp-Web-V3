import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { getLogger } from '@/lib/logger';

const log = getLogger('ConnectionHealthPanel');
import { supabase } from '@/integrations/supabase/client';
import { safeWhatsAppConnectionsQuery } from '@/integrations/supabase/safe-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WifiOff,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
  Loader2,
  HeartPulse,
  Zap,
  Timer,
  Link as LinkIcon,
  Check,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConnectionHealth {
  id: string;
  name: string;
  instance_name: string | null;
  status: string;
  phone_number: string | null;
  last_health_check: string | null;
  health_status: string | null;
  health_response_ms: number | null;
}

interface HealthLog {
  id: string;
  instance_id: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export function ConnectionHealthPanel(): JSX.Element {
  const [connections, setConnections] = useState<ConnectionHealth[]>([]);
  const [recentLogs, setRecentLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const mountedRef = useMountedRef();
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    []
  );

  const handleCopyQrLink = async (conn: ConnectionHealth): Promise<void> => {
    const instance = conn.instance_name ?? conn.name;
    await navigator.clipboard.writeText(instance);
    setCopiedId(conn.id);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
    toast.success('Identificador da instância copiado.');
  };

  const fetchData = useCallback(async (): Promise<void> => {
    const safeQueries = safeWhatsAppConnectionsQuery(supabase as unknown as SupabaseClient<Database>);
    const [connResult, { data: logs }] = await Promise.all([
      safeQueries.getList(),
      supabase
        .from('connection_health_logs')
        .select('id, instance_id, status, response_time_ms, error_message, checked_at')
        .order('checked_at', { ascending: false })
        .limit(50),
    ]);

    if (!mountedRef.current) return;
    if (connResult.data) setConnections(connResult.data as unknown as ConnectionHealth[]);
    if (logs) setRecentLogs(logs as HealthLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('health-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_health_logs' },
        () => {
          fetchData();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const runHealthCheck = async (): Promise<void> => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('connection-health-check');
      if (error) throw error;
      toast.success(
        `Health check concluído: ${data?.connections?.length || 0} conexões verificadas`
      );
      await fetchData();
    } catch (err) {
      toast.error('Erro ao executar health check');
      log.error('Health check error:', err);
    } finally {
      setChecking(false);
    }
  };

  const statusConfig: Record<
    string,
    { icon: typeof CheckCircle2; color: string; label: string; bg: string }
  > = {
    healthy: { icon: CheckCircle2, color: 'text-success', label: 'Saudável', bg: 'bg-success/10' },
    degraded: {
      icon: AlertTriangle,
      color: 'text-warning',
      label: 'Degradado',
      bg: 'bg-warning/10',
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-destructive',
      label: 'Desconectado',
      bg: 'bg-destructive/10',
    },
    error: { icon: XCircle, color: 'text-destructive', label: 'Erro', bg: 'bg-destructive/10' },
    timeout: { icon: Timer, color: 'text-warning', label: 'Timeout', bg: 'bg-warning/10' },
    unknown: {
      icon: Activity,
      color: 'text-muted-foreground',
      label: 'Desconhecido',
      bg: 'bg-muted/50',
    },
  };

  const healthyCount = connections.filter((c) => c.health_status === 'healthy').length;
  const avgResponseTime =
    connections.length > 0
      ? Math.round(
          connections.reduce((sum, c) => sum + (c.health_response_ms || 0), 0) / connections.length
        )
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-border/50">
          <CardContent className="pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <HeartPulse className="h-4 w-4" />
              <span className="text-xs font-medium">Conexões Saudáveis</span>
            </div>
            <p className="text-2xl font-bold">
              {healthyCount}/{connections.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium">Tempo Médio</span>
            </div>
            <p className="text-2xl font-bold">{avgResponseTime}ms</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-medium">Checks (7d)</span>
            </div>
            <p className="text-2xl font-bold">{recentLogs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center pb-3 pt-4">
            <Button onClick={runHealthCheck} disabled={checking} className="w-full gap-2">
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {checking ? 'Verificando...' : 'Executar Health Check'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Connection Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {connections.map((conn) => {
            const cfg = statusConfig[conn.health_status || 'unknown'] || statusConfig.unknown;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className={cn('border-border/50 transition-all hover:shadow-md', cfg.bg)}>
                  <CardContent className="space-y-3 pb-4 pt-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-5 w-5', cfg.color)} />
                          <span className="text-sm font-semibold">
                            {conn.name || conn.instance_name || 'Sem nome'}
                          </span>
                        </div>
                        {conn.phone_number && (
                          <p className="pl-7 text-xs text-muted-foreground">{conn.phone_number}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={cn('text-xs', cfg.color)}>
                        {cfg.label}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {conn.last_health_check
                            ? formatDistanceToNow(new Date(conn.last_health_check), {
                                addSuffix: true,
                                locale: ptBR,
                              })
                            : 'Nunca verificado'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        <span>
                          {conn.health_response_ms ? `${conn.health_response_ms}ms` : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        {conn.status === 'connected' && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        )}
                        <span
                          className={cn(
                            'relative inline-flex h-2 w-2 rounded-full',
                            conn.status === 'connected' ? 'bg-success' : 'bg-destructive'
                          )}
                        />
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {conn.status}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => handleCopyQrLink(conn)}
                      aria-label={`Copiar link do QR Code da instância ${conn.name || conn.instance_name}`}
                    >
                      {copiedId === conn.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-success" />
                          Link copiado
                        </>
                      ) : (
                        <>
                          <LinkIcon className="h-3.5 w-3.5" />
                          Copiar link do QR
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Recent Logs */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Histórico de Health Checks
          </CardTitle>
          <CardDescription>Últimas 50 verificações</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1.5">
              {recentLogs.map((entry) => {
                const cfg = statusConfig[entry.status] || statusConfig.unknown;
                const Icon = cfg.icon;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <Icon className={cn('h-4 w-4 flex-shrink-0', cfg.color)} />
                    <span className="min-w-[120px] font-medium">{entry.instance_id}</span>
                    <Badge variant="outline" className={cn('text-[10px]', cfg.color)}>
                      {cfg.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {entry.response_time_ms ? `${entry.response_time_ms}ms` : '—'}
                    </span>
                    {entry.error_message && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="h-3.5 w-3.5 cursor-help text-warning" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">{entry.error_message}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(new Date(entry.checked_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                    </span>
                  </div>
                );
              })}
              {recentLogs.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum health check registrado. Execute uma verificação acima.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
