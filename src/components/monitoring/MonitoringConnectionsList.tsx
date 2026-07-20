import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, CheckCircle2, XCircle, AlertTriangle, Clock, Settings2, PlayCircle, Loader2, RefreshCw, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ConnectionInfo, WebhookTestResult } from './hooks/useEvolutionMonitoring';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

interface Props {
  connections: ConnectionInfo[];
  webhookTest: WebhookTestResult;
  onCheckWebhook: (instanceId: string) => void;
  onTestWebhook: (instanceId: string) => void;
}

const statusIcon = (status: string | null) => {
  switch (status) {
    case 'connected': case 'healthy': return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
    case 'disconnected': case 'error': return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case 'degraded': return <AlertTriangle className="w-3.5 h-3.5 text-warning-foreground" />;
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

/** Monitoring Connections List component for the monitoring section. */
export function MonitoringConnectionsList({ connections, webhookTest, onCheckWebhook, onTestWebhook }: Props) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [loadingQr, setLoadingQr] = useState<Record<string, boolean>>({});
  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});

  const fetchQrCode = useCallback(async (conn: ConnectionInfo) => {
    const evoName = evolutionInstanceName(conn);
    if (!evoName) { toast.error('Conexão sem nome de instância válido.'); return; }
    setLoadingQr(prev => ({ ...prev, [conn.instance_id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'get-qrcode', instanceName: evoName },
      });
      if (error) throw error;
      const base64 = data?.qrcode?.base64 || data?.base64;
      if (base64) {
        setQrCodes(prev => ({ ...prev, [conn.instance_id]: base64 }));
      } else {
        toast.info('QR Code não disponível. A instância pode já estar conectada.');
      }
    } catch {
      toast.error('Erro ao buscar QR Code');
    } finally {
      setLoadingQr(prev => ({ ...prev, [conn.instance_id]: false }));
    }
  }, []);

  const reconnectInstance = useCallback(async (conn: ConnectionInfo) => {
    const evoName = evolutionInstanceName(conn);
    if (!evoName) { toast.error('Conexão sem nome de instância válido.'); return; }
    setReconnecting(prev => ({ ...prev, [conn.instance_id]: true }));
    try {
      const { error: restartErr } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'restart-instance', instanceName: evoName },
      });
      if (restartErr) throw restartErr;
      toast.success(`Instância ${evoName} reiniciada!`);
    } catch {
      toast.error('Erro ao reconectar instância');
    } finally {
      setReconnecting(prev => ({ ...prev, [conn.instance_id]: false }));
    }
  }, []);

  if (connections.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <WifiOff className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma conexão cadastrada.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {connections.map((conn, i) => {
        const isOffline = conn.status !== 'connected';
        return (
          <motion.div
            key={conn.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="hover:shadow-md transition-all border-border/60">
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                      conn.status === 'connected' ? 'bg-primary/10' : 'bg-destructive/10'
                    )}>
                      {conn.status === 'connected'
                        ? <Wifi className="w-5 h-5 text-primary" />
                        : <WifiOff className="w-5 h-5 text-destructive" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{conn.instance_id}</span>
                        <Badge variant={conn.status === 'connected' ? 'default' : 'destructive'} className="text-[10px]">
                          {conn.status}
                        </Badge>
                        {conn.health_status && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            {statusIcon(conn.health_status)}
                            {conn.health_status}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                        {conn.phone_number && <span>📱 {conn.phone_number}</span>}
                        {conn.health_response_ms != null && (
                          <span className={cn('font-medium',
                            conn.health_response_ms < 300 ? 'text-primary' :
                            conn.health_response_ms < 800 ? 'text-warning-foreground' : 'text-destructive'
                          )}>
                            ⚡ {conn.health_response_ms}ms
                          </span>
                        )}
                        {conn.last_health_check && (
                          <span>🕐 {formatDistanceToNow(new Date(conn.last_health_check), { addSuffix: true, locale: ptBR })}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {isOffline && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => fetchQrCode(conn)} disabled={loadingQr[conn.instance_id]} className="text-xs h-8">
                          {loadingQr[conn.instance_id] ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <QrCode className="w-3.5 h-3.5 mr-1" />}
                          QR Code
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => reconnectInstance(conn)} disabled={reconnecting[conn.instance_id]} className="text-xs h-8 text-warning-foreground">
                          {reconnecting[conn.instance_id] ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                          Reconectar
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { const n = evolutionInstanceName(conn); if (!n) { toast.error('Conexão sem nome de instância roteável. Reconecte via QR.'); return; } onCheckWebhook(n); }} className="text-xs h-8">
                      <Settings2 className="w-3.5 h-3.5 mr-1" />Webhook
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { const n = evolutionInstanceName(conn); if (!n) { toast.error('Conexão sem nome de instância roteável. Reconecte via QR.'); return; } onTestWebhook(n); }} disabled={webhookTest.status === 'testing'} className="text-xs h-8">
                      {webhookTest.status === 'testing'
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Testando</>
                        : <><PlayCircle className="w-3.5 h-3.5 mr-1" />Testar</>
                      }
                    </Button>
                  </div>
                </div>

                {/* QR Code inline */}
                {qrCodes[conn.instance_id] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mt-4 flex justify-center"
                  >
                    <div className="p-4 bg-background rounded-xl border shadow-sm">
                      <img
                        src={qrCodes[conn.instance_id]}
                        alt={`QR Code ${conn.instance_id}`}
                        className="w-48 h-48 object-contain"
                      />
                      <p className="text-[10px] text-center text-muted-foreground mt-2">
                        Escaneie com WhatsApp
                      </p>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
