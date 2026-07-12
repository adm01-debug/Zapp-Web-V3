import { useState } from 'react';

const RESTART_SETTLE_MS = 4000;
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Smartphone,
  MoreVertical,
  Trash2,
  Copy,
  QrCode,
  Wifi,
  WifiOff,
  Star,
  Clock,
  Loader2,
  RefreshCw,
  History,
  Link2,
  Settings,
  Boxes,
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Activity,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { BusinessHoursIndicator } from './BusinessHoursIndicator';
import { OfficialApiConfigDialog } from './OfficialApiConfigDialog';
import { ConnectionAuditDialog } from './ConnectionAuditDialog';
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

/** Human-friendly status — no jargon. */
const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Wifi; bgClass: string }
> = {
  connected: {
    label: 'Online',
    color: 'text-primary',
    icon: Wifi,
    bgClass: 'bg-primary/10 border-primary/20',
  },
  disconnected: {
    label: 'Desconectado',
    color: 'text-destructive-foreground',
    icon: WifiOff,
    bgClass: 'bg-destructive/10 border-destructive/20',
  },
  disconnecting: {
    label: 'Desconectando...',
    color: 'text-destructive-foreground',
    icon: Loader2,
    bgClass: 'bg-destructive/10 border-destructive/20 animate-pulse',
  },
  connecting: {
    label: 'Conectando...',
    color: 'text-warning-foreground',
    icon: RefreshCw,
    bgClass: 'bg-warning/10 border-warning/20',
  },
  pending: {
    label: 'Aguardando QR',
    color: 'text-warning-foreground',
    icon: QrCode,
    bgClass: 'bg-warning/10 border-warning/20',
  },
};

/** Human-friendly health reason labels. */
const HEALTH_REASON_LABEL: Record<string, { short: string; long: string; severe: boolean }> = {
  phantom_session: {
    short: 'Sessão Fantasma',
    long: 'O servidor Evolution diz que está "open", mas o WhatsApp não reconhece a sessão. Reconecte.',
    severe: true,
  },
  webhook_silent: {
    short: 'Instância Silenciosa',
    long: 'Nenhuma mensagem recebida nos últimos 30 minutos. Verifique o celular.',
    severe: false,
  },
  stale_session: {
    short: 'Sem atividade recente',
    long: 'Nenhuma mensagem nas últimas 24h. Normal em horários de baixo movimento — a conexão continua ativa.',
    severe: false,
  },
  socket_closed: {
    short: 'Socket Fechado',
    long: 'A conexão com o servidor de mensagens foi encerrada.',
    severe: true,
  },
  http_error: {
    short: 'Erro de API',
    long: 'Falha ao comunicar com a Evolution API. Verifique as credenciais.',
    severe: true,
  },
  timeout: {
    short: 'Timeout',
    long: 'O servidor demorou demais para responder o health-check.',
    severe: true,
  },
  auth_failure: {
    short: 'Falha de Auth',
    long: 'A API Key da Evolution parece inválida ou expirou.',
    severe: true,
  },
  rate_limit: {
    short: 'Rate Limit',
    long: 'Muitas requisições em pouco tempo. Aguarde um momento.',
    severe: false,
  },
};

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
      // 1. Tentar reiniciar a instância na Evolution API (POST /instance/restart)
      await restartInstance(instanceName);

      // 2. Aguardar um pouco para o restart processar
      await new Promise((r) => setTimeout(r, RESTART_SETTLE_MS));

      // 3. Forçar um health check para atualizar o status no painel
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

        // 4. Se ainda estiver desconectado, dispara automaticamente o connect para gerar QR
        await connectInstance(instanceName);

        // Abre o modal de QR code automaticamente
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

  const getLastActivity = () => {
    if (!connection.updated_at) return null;
    const diff = Date.now() - new Date(connection.updated_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins} min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  };

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

                  {/* Single status line */}
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

                    {isConnected && !isPhantomLike && getLastActivity() && (
                      <span className="text-[11px] text-muted-foreground">
                        Atualizado {getLastActivity()}
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

              {/* Right: single primary action + menu */}
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
                          onClick={async () => {
                            if (connection.status === 'disconnecting') {
                              toast({
                                title: 'Aguarde',
                                description:
                                  'A sessão está sendo encerrada. Tente reconectar em instantes.',
                              });
                              return;
                            }
                            handleReconnect();
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

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="Opções da conexão"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Conexão
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      disabled={recheckingHealth || !evoName}
                      onClick={handleRecheckNow}
                    >
                      {recheckingHealth ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Activity className="mr-2 h-4 w-4" />
                      )}
                      Verificar agora
                    </DropdownMenuItem>
                    {!isOfficial && (
                      <DropdownMenuItem onClick={() => onShowQrCode(connection)}>
                        <QrCode className="mr-2 h-4 w-4" />
                        Gerar QR Code
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onSetDefault(connection.id)}>
                      <Star className="mr-2 h-4 w-4" />
                      Definir como principal
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Configuração
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => onBusinessHours(connection.id, connection.name)}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      Horário de Atendimento
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onQueues(connection.id, connection.name)}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Vincular Filas
                    </DropdownMenuItem>
                    {evoName && (
                      <>
                        <DropdownMenuItem onClick={() => onSettings(evoName, connection.name)}>
                          <Settings className="mr-2 h-4 w-4" />
                          Configurações & Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onIntegrations(evoName, connection.name)}>
                          <Boxes className="mr-2 h-4 w-4" />
                          Integrações (IA/Bots)
                        </DropdownMenuItem>
                      </>
                    )}
                    {onSetApiType && (
                      <DropdownMenuItem
                        onClick={() =>
                          onSetApiType(connection, isOfficial ? 'evolution' : 'official')
                        }
                      >
                        {isOfficial ? (
                          <Zap className="mr-2 h-4 w-4" />
                        ) : (
                          <ShieldCheck className="mr-2 h-4 w-4" />
                        )}
                        Mudar para {isOfficial ? 'QR Code' : 'API Oficial'}
                      </DropdownMenuItem>
                    )}
                    {isOfficial && (
                      <DropdownMenuItem onClick={() => setOfficialConfigOpen(true)}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Configurar Cloud API
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Avançado
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setAuditDialogOpen(true)}>
                      <ListChecks className="mr-2 h-4 w-4" />
                      Log de Auditoria
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCopyId(connection.id)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar ID
                    </DropdownMenuItem>
                    {connection.instance_id && (
                      <DropdownMenuItem
                        disabled={syncingHistory === connection.id}
                        onClick={() => onSyncHistory(connection)}
                      >
                        {syncingHistory === connection.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <History className="mr-2 h-4 w-4" />
                        )}
                        Sincronizar Histórico
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(connection)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir conexão
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Status banner — destructive when severe, soft warning otherwise */}
            {(needsAction || reasonInfo) &&
              !isOfficial &&
              (() => {
                const severe = !!isPhantomLike || connection.status === 'disconnected';
                return (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2',
                      severe
                        ? 'bg-destructive/8 border-destructive/15'
                        : 'border-border/60 bg-muted/40'
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
                );
              })()}
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
