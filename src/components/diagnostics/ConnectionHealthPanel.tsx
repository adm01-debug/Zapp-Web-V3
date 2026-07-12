import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';

const log = getLogger('ConnectionHealthPanel');
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Activity, Loader2, HeartPulse, Zap, Timer, Link as LinkIcon, Check,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConnectionHealth {
  id: string;
  instance_id: string;
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

export function ConnectionHealthPanel() {
  const [connections, setConnections] = useState<ConnectionHealth[]>([]);
  const [recentLogs, setRecentLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const mountedRef = useMountedRef();
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  /** Build a deep link that opens the connections view and auto-launches the QR dialog. */
  const buildQrLink = (instanceId: string) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('view', 'connections');
    url.searchParams.set('qr', instanceId);
    return url.toString();
  };

  const handleCopyQrLink = async (conn: ConnectionHealth) => {
    if (!conn.instance_id) {
      toast.error('Instância sem identificador — não é possível gerar o link.');
      return;
    }
    const link = buildQrLink(conn.instance_id);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(conn.id);
      toast.success('Link do QR copiado — abra em outro dispositivo para reconectar.');
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedId((c) => (c === conn.id ? null : c)), 2000);
    } catch {
      toast.error('Falha ao copiar. Copie manualmente: ' + link);
    }
  };

  const fetchData = useCallback(async () => {
    const [{ data: conns }, { data: logs }] = await Promise.all([
      supabase
        .from('whatsapp_connections')
        .select('id, instance_id, status, phone_number, last_health_check, health_status, health_response_ms')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('connection_health_logs')
        .select('id, instance_id, status, response_time_ms, error_message, checked_at')
        .order('checked_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50),
    ]);

    if (!mountedRef.current) return;
    if (conns) setConnections(conns as ConnectionHealth[]);
    if (logs) setRecentLogs(logs as HealthLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('health-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'zapp', table: 'connection_health_logs' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('connection-health-check');
      if (error) throw error;
      toast.success(`Health check concluído: ${data?.connections?.length || 0} conexões verificadas`);
      await fetchData();
    } catch (err) {
      toast.error('Erro ao executar health check');
      log.error('Health check error:', err);
    } finally {
      setChecking(false);
    }
  };

  const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string; bg: string }> = {
    healthy: { icon: CheckCircle2, color: 'text-success', label: 'Saudável', bg: 'bg-success/10' },
    degraded: { icon: AlertTriangle, color: 'text-warning', label: 'Degradado', bg: 'bg-warning/10' },
    disconnected: { icon: WifiOff, color: 'text-destructive', label: 'Desconectado', bg: 'bg-destructive/10' },
    error: { icon: XCircle, color: 'text-destructive', label: 'Erro', bg: 'bg-destructive/10' },
    timeout: { icon: Timer, color: 'text-warning', label: 'Timeout', bg: 'bg-warning/10' },
    unknown: { icon: Activity, color: 'text-muted-foreground', label: 'Desconhecido', bg: 'bg-muted/50' },
  };

  const healthyCount = connections.filter(c => c.health_status === 'healthy').length;
  const avgResponseTime = connections.length > 0
    ? Math.round(connections.reduce((sum, c) => sum + (c.health_response_ms || 0), 0) / connections.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HeartPulse className="w-4 h-4" />
              <span className="text-xs font-medium">Conexões Saudáveis</span>
            </div>
            <p className="text-2xl font-bold">{healthyCount}/{connections.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-medium">Tempo Médio</span>
            </div>
            <p className="text-2xl font-bold">{avgResponseTime}ms</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-medium">Checks (7d)</span>
            </div>
            <p className="text-2xl font-bold">{recentLogs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3 flex items-center justify-center">
            <Button onClick={runHealthCheck} disabled={checking} className="w-full gap-2">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {checking ? 'Verificando...' : 'Executar Health Check'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Connection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('w-5 h-5', cfg.color)} />
                          <span className="font-semibold text-sm">{conn.instance_id}</span>
                        </div>
                        {conn.phone_number && (
                          <p className="text-xs text-muted-foreground pl-7">{conn.phone_number}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={cn('text-xs', cfg.color)}>
                        {cfg.label}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {conn.last_health_check
                            ? formatDistanceToNow(new Date(conn.last_health_check), { addSuffix: true, locale: ptBR })
                            : 'Nunca verificado'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>{conn.health_response_ms ? `${conn.health_response_ms}ms` : '—'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        {conn.status === 'connected' && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        )}
                        <span className={cn(
                          'relative inline-flex h-2 w-2 rounded-full',
                          conn.status === 'connected' ? 'bg-success' : 'bg-destructive'
                        )} />
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{conn.status}</span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => handleCopyQrLink(conn)}
                      aria-label={`Copiar link do QR Code da instância ${conn.instance_id}`}
                    >
                      {copiedId === conn.id
                        ? <><Check className="w-3.5 h-3.5 text-success" />Link copiado</>
                        : <><LinkIcon className="w-3.5 h-3.5" />Copiar link do QR</>}
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
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Histórico de Health Checks
          </CardTitle>
          <CardDescription>Últimas 50 verificações</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1.5">
              {recentLogs.map((log) => {
                const cfg = statusConfig[log.status] || statusConfig.unknown;
                const Icon = cfg.icon;
                return (
                  <div key={log.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 text-sm">
                    <Icon className={cn('w-4 h-4 flex-shrink-0', cfg.color)} />
                    <span className="font-medium min-w-[120px]">{log.instance_id}</span>
                    <Badge variant="outline" className={cn('text-[10px]', cfg.color)}>
                      {cfg.label}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {log.response_time_ms ? `${log.response_time_ms}ms` : '—'}
                    </span>
                    {log.error_message && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="w-3.5 h-3.5 text-warning cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">{log.error_message}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <span className="text-muted-foreground text-xs ml-auto">
                      {format(new Date(log.checked_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                    </span>
                  </div>
                );
              })}
              {recentLogs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
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
