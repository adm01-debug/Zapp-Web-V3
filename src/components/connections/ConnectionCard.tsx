import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Smartphone,
  Star,
  Clock,
  Loader2,
  RefreshCw,
  QrCode,
  WifiOff,
  ShieldCheck,
  AlertTriangle,
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { BusinessHoursIndicator } from './BusinessHoursIndicator';
import { OfficialApiConfigDialog } from './OfficialApiConfigDialog';
import { ConnectionAuditDialog } from './ConnectionAuditDialog';
import { ConnectionCardMenu } from './ConnectionCardMenu';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { WhatsAppConnection } from '@/features/connections';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import { statusConfig, HEALTH_REASON_LABEL, getLastActivity } from './connectionCardHelpers';

interface ConnectionCardProps {
  connection: WhatsAppConnection;
  syncingHistory: string | null;
  onShowQrCode: (c: WhatsAppConnection) => void;
  onCopyId: (id: string) => void;
  onDisconnect: (c: WhatsAppConnection) => Promise<void>;
  onSetDefault: (id: string) => void;
  onSetApiType?: (c: WhatsAppConnection, api_type: 'evolution' | 'official') => void;
  onDelete: (c: WhatsAppConnection) => void;
  onBusinessHours: (id: string, name: string) => void;
  onQueues: (id: string, name: string) => void;
  onSettings: (instanceName: string, name: string) => void;
  onIntegrations: (instanceName: string, name: string) => void;
  onSyncHistory: (connection: WhatsAppConnection) => void;
}

export function ConnectionCard({
  connection,
  syncingHistory,
  onShowQrCode,
  onCopyId,
  onDisconnect,
  onSetDefault,
  onSetApiType,
  onDelete,
  onBusinessHours,
  onQueues,
  onSettings,
  onIntegrations,
  onSyncHistory,
}: ConnectionCardProps) {
  const status = statusConfig[connection.status] || statusConfig.disconnected;
  const isOfficial = (connection.api_type ?? 'evolution') === 'official';
  const [officialConfigOpen, setOfficialConfigOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [recheckingHealth, setRecheckingHealth] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { restartInstance, connectInstance } = useEvolutionApi();
  const isConnected = connection.status === 'connected';
  // Nome roteável na Evolution API (nunca o UUID interno — ver src/lib/evolutionInstance.ts)
  const evoName = evolutionInstanceName(connection);

  const reasonInfo = connection.health_reason
    ? HEALTH_REASON_LABEL[connection.health_reason]
    : null;
  const isPhantomLike = reasonInfo?.severe && connection.health_status !== 'healthy';
  const needsAction = isPhantomLike || connection.status === 'disconnected';

  const handleReconnect = async () => {
    // Evolution API roteia por NOME de instância; passar o instance_id (UUID)
    // gera 404 e o auto-create da edge function cria uma instância fantasma
    // (incidente wpp2 de 2026-07-04).
    const instanceName = evolutionInstanceName(connection);
    if (!instanceName) {
      toast({
        title: 'Conexão sem nome de instância',
        description: 'Cadastre o instance_name desta conexão antes de reconectar.',
        variant: 'destructive',
      });
      return;
    }
    setReconnecting(true);
    try {
      await restartInstance(instanceName);
      await new Promise((r) => setTimeout(r, 4000));
      const { data, error } = await supabase.functions.invoke('connection-health-check', {
        body: { instanceName },
      });
      if (error) throw error;
      const isStillClosed =
        data?.connections?.[0]?.socket_state === 'close' ||
        data?.connections?.[0]?.status === 'disconnected';
      if (isStillClosed) {
        toast({
          title: 'Ação automática',
          description: 'A instância ainda está desconectada. Gerando novo QR Code...',
        });
        await connectInstance(instanceName);
        onShowQrCode(connection);
      } else {
        toast({ title: 'Sucesso', description: 'Instância reconectada e operacional.' });
      }
    } catch (e: unknown) {
      toast({
        title: 'Erro ao reconectar',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setReconnecting(false);
    }
  };

  const handleRecheckNow = async () => {
    const instanceName = evolutionInstanceName(connection);
    if (!instanceName) return;
    setRecheckingHealth(true);
    try {
      const { error } = await supabase.functions.invoke('connection-health-check', {
        body: { instanceName },
      });
      if (error) throw error;
      toast({ title: 'Verificação concluída', description: 'O status foi atualizado.' });
    } catch (e: unknown) {
      toast({
        title: 'Falha na verificação',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setRecheckingHealth(false);
    }
  };

  const lastActivity = getLastActivity(connection.updated_at);
  const severe = !!isPhantomLike || connection.status === 'disconnected';

  return (
    <>
      <motion.div whileHover={{ y: -2, boxShadow: '0 8px 30px hsl(var(--primary) / 0.08)' }}>
        <Card
          className={cn(
            'overflow-hidden border transition-all',
            isConnected && !isPhantomLike
              ? 'border-primary/20 bg-card shadow-lg shadow-emerald-500/5'
              : needsAction
                ? 'border-destructive/20 bg-card shadow-lg shadow-red-500/5'
                : 'border-secondary/20 bg-card'
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              {/* Left: Status orb + info */}
              <div className="flex min-w-0 items-start gap-3">
                <div className="relative mt-0.5 shrink-0">
                  <motion.div
                    animate={connection.status === 'connecting' ? { rotate: 360 } : {}}
                    transition={{
                      duration: 1,
                      repeat: connection.status === 'connecting' ? Infinity : 0,
                      ease: 'linear',
                    }}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full',
                      isConnected && !isPhantomLike
                        ? 'bg-primary/15'
                        : needsAction
                          ? 'bg-destructive/15'
                          : 'bg-muted'
                    )}
                  >
                    <Smartphone
                      className={cn(
                        'h-5 w-5',
                        isConnected && !isPhantomLike
                          ? 'text-primary'
                          : needsAction
                            ? 'text-destructive-foreground'
                            : 'text-muted-foreground'
                      )}
                    />
                  </motion.div>
                  {isConnected && !isPhantomLike && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-primary" />
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{connection.name}</h3>
                    {connection.is_default && (
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 py-0 text-[10px]">
                        <Star className="mr-0.5 h-3 w-3" />
                        Principal
                      </Badge>
                    )}
                  </div>

                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">{connection.phone_number}</p>
                    {connection.battery_level != null && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        {connection.is_plugged ? (
                          <BatteryCharging className="h-3.5 w-3.5 text-primary" />
                        ) : connection.battery_level <= 20 ? (
                          <BatteryLow className="h-3.5 w-3.5 text-destructive" />
                        ) : connection.battery_level <= 50 ? (
                          <BatteryMedium className="h-3.5 w-3.5 text-warning-foreground" />
                        ) : (
                          <BatteryFull className="h-3.5 w-3.5 text-primary" />
                        )}
                        {connection.battery_level}%
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'gap-1.5 px-2 py-0.5 text-[11px] font-medium',
                        status.bgClass,
                        status.color
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          isConnected && !isPhantomLike
                            ? 'bg-primary'
                            : needsAction
                              ? 'bg-destructive'
                              : 'bg-warning'
                        )}
                      />
                      {isPhantomLike ? (reasonInfo?.short ?? 'Precisa reconectar') : status.label}
                    </Badge>
                    {isConnected && !isPhantomLike && lastActivity && (
                      <span className="text-[11px] text-muted-foreground">
                        Atualizado {lastActivity}
                      </span>
                    )}
                    {connection.health_response_ms != null && isConnected && (
                      <span className="text-[10px] text-muted-foreground">
                        {connection.health_response_ms}ms
                      </span>
                    )}
                    {(connection.retry_count ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="border-warning/30 text-[10px] text-warning-foreground"
                      >
                        Tentativa {connection.retry_count}/{connection.max_retries || 5}
                      </Badge>
                    )}
                    <BusinessHoursIndicator connectionId={connection.id} />
                  </div>
                </div>
              </div>

              {/* Right: primary action buttons + menu */}
              <div className="flex shrink-0 items-center gap-2">
                {(connection.status === 'disconnected' ||
                  connection.status === 'disconnecting' ||
                  isPhantomLike) &&
                  !isOfficial && (
                    <div className="flex gap-2">
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reconnecting}
                          onClick={() => {
                            if (connection.status === 'disconnecting') {
                              toast({
                                title: 'Aguarde',
                                description:
                                  'A sessão está sendo encerrada. Tente reconectar em instantes.',
                              });
                              return;
                            }
                            void handleReconnect();
                          }}
                          className="border-whatsapp text-whatsapp hover:bg-whatsapp/5"
                        >
                          {reconnecting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1.5 h-4 w-4" />
                          )}
                          Reconectar
                        </Button>
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Button
                          size="sm"
                          onClick={() => onShowQrCode(connection)}
                          className="bg-whatsapp text-primary-foreground shadow-lg shadow-whatsapp/20 hover:bg-whatsapp/90"
                        >
                          <QrCode className="mr-1.5 h-4 w-4" />
                          QR Code
                        </Button>
                      </motion.div>
                    </div>
                  )}
                {connection.status !== 'connected' && isOfficial && evoName && (
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSettings(evoName, connection.name)}
                      className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      <ShieldCheck className="mr-1.5 h-4 w-4" />
                      Configurar
                    </Button>
                  </motion.div>
                )}
                {connection.status === 'connected' && !isPhantomLike && (
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => setConfirmDisconnect(true)}
                    >
                      <WifiOff className="mr-1.5 h-4 w-4" />
                      Desconectar
                    </Button>
                  </motion.div>
                )}

                <ConnectionCardMenu
                  connection={connection}
                  recheckingHealth={recheckingHealth}
                  evoName={evoName}
                  isOfficial={isOfficial}
                  syncingHistory={syncingHistory}
                  hasSetApiType={!!onSetApiType}
                  onRecheckNow={() => void handleRecheckNow()}
                  onShowQrCode={() => onShowQrCode(connection)}
                  onSetDefault={() => onSetDefault(connection.id)}
                  onBusinessHours={() => onBusinessHours(connection.id, connection.name)}
                  onQueues={() => onQueues(connection.id, connection.name)}
                  onSettings={() => evoName && onSettings(evoName, connection.name)}
                  onIntegrations={() => evoName && onIntegrations(evoName, connection.name)}
                  onToggleApiType={() =>
                    onSetApiType?.(connection, isOfficial ? 'evolution' : 'official')
                  }
                  onOpenOfficialConfig={() => setOfficialConfigOpen(true)}
                  onOpenAuditLog={() => setAuditDialogOpen(true)}
                  onCopyId={() => onCopyId(connection.id)}
                  onSyncHistory={() => onSyncHistory(connection)}
                  onDelete={() => onDelete(connection)}
                />
              </div>
            </div>

            {/* Status banner — destructive when severe, soft warning otherwise */}
            {(needsAction || reasonInfo) && !isOfficial && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2',
                  severe ? 'bg-destructive/8 border-destructive/15' : 'border-border/60 bg-muted/40'
                )}
              >
                <AlertTriangle
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    severe ? 'text-destructive-foreground' : 'text-muted-foreground'
                  )}
                />
                <span
                  className={cn(
                    'text-xs leading-relaxed',
                    severe ? 'text-destructive-foreground' : 'text-muted-foreground'
                  )}
                >
                  {reasonInfo?.long ??
                    'Esta conexão está desconectada. Escaneie o QR Code para reconectar.'}
                </span>
              </motion.div>
            )}
          </CardContent>
        </Card>
        {isOfficial && (
          <OfficialApiConfigDialog
            open={officialConfigOpen}
            onOpenChange={setOfficialConfigOpen}
            connectionId={connection.id}
            connectionName={connection.name}
            instanceId={connection.instance_id}
          />
        )}
        {connection.instance_id && (
          <ConnectionAuditDialog
            open={auditDialogOpen}
            onOpenChange={setAuditDialogOpen}
            instanceId={connection.instance_id}
            connectionName={connection.name}
          />
        )}
      </motion.div>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar "{connection.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação encerrará a sessão do WhatsApp. Você precisará escanear o QR Code novamente
              para reconectar e poderá perder o recebimento de novas mensagens até lá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                setIsDisconnecting(true);
                try {
                  await onDisconnect(connection);
                  setConfirmDisconnect(false);
                } finally {
                  setIsDisconnecting(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desconectando...
                </>
              ) : (
                'Sim, desconectar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
