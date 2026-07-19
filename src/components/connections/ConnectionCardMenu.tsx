import {
  Loader2,
  Activity,
  QrCode,
  Star,
  Clock,
  Link2,
  Settings,
  Boxes,
  Zap,
  ShieldCheck,
  ListChecks,
  Copy,
  History,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { WhatsAppConnection } from '@/features/connections';

interface ConnectionCardMenuProps {
  connection: WhatsAppConnection;
  recheckingHealth: boolean;
  evoName: string | null;
  isOfficial: boolean;
  syncingHistory: string | null;
  hasSetApiType: boolean;
  onRecheckNow: () => void;
  onShowQrCode: () => void;
  onSetDefault: () => void;
  onBusinessHours: () => void;
  onQueues: () => void;
  onSettings: () => void;
  onIntegrations: () => void;
  onToggleApiType: () => void;
  onOpenOfficialConfig: () => void;
  onOpenAuditLog: () => void;
  onCopyId: () => void;
  onSyncHistory: () => void;
  onDelete: () => void;
}

/** Connection Card Menu component for the connections section. */
export function ConnectionCardMenu({
  connection,
  recheckingHealth,
  evoName,
  isOfficial,
  syncingHistory,
  hasSetApiType,
  onRecheckNow,
  onShowQrCode,
  onSetDefault,
  onBusinessHours,
  onQueues,
  onSettings,
  onIntegrations,
  onToggleApiType,
  onOpenOfficialConfig,
  onOpenAuditLog,
  onCopyId,
  onSyncHistory,
  onDelete,
}: ConnectionCardMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Opções da conexão" variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Conexão
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={recheckingHealth || !evoName} onClick={onRecheckNow}>
          {recheckingHealth ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Activity className="mr-2 h-4 w-4" />
          )}
          Verificar agora
        </DropdownMenuItem>
        {!isOfficial && (
          <DropdownMenuItem onClick={onShowQrCode}>
            <QrCode className="mr-2 h-4 w-4" />
            Gerar QR Code
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onSetDefault}>
          <Star className="mr-2 h-4 w-4" />
          Definir como principal
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Configuração
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={onBusinessHours}>
          <Clock className="mr-2 h-4 w-4" />
          Horário de Atendimento
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onQueues}>
          <Link2 className="mr-2 h-4 w-4" />
          Vincular Filas
        </DropdownMenuItem>
        {evoName && (
          <>
            <DropdownMenuItem onClick={onSettings}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações & Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onIntegrations}>
              <Boxes className="mr-2 h-4 w-4" />
              Integrações (IA/Bots)
            </DropdownMenuItem>
          </>
        )}
        {hasSetApiType && (
          <DropdownMenuItem onClick={onToggleApiType}>
            {isOfficial ? (
              <Zap className="mr-2 h-4 w-4" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Mudar para {isOfficial ? 'QR Code' : 'API Oficial'}
          </DropdownMenuItem>
        )}
        {isOfficial && (
          <DropdownMenuItem onClick={onOpenOfficialConfig}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Configurar Cloud API
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Avançado
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={onOpenAuditLog}>
          <ListChecks className="mr-2 h-4 w-4" />
          Log de Auditoria
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyId}>
          <Copy className="mr-2 h-4 w-4" />
          Copiar ID
        </DropdownMenuItem>
        {connection.instance_id && (
          <DropdownMenuItem disabled={syncingHistory === connection.id} onClick={onSyncHistory}>
            {syncingHistory === connection.id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <History className="mr-2 h-4 w-4" />
            )}
            Sincronizar Histórico
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir conexão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
