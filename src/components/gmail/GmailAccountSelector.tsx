import { Plus, Settings, Wifi, WifiOff, RefreshCw, ChevronDown, LogOut, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type EmailAccount } from '@/hooks/gmail/gmailTypes';
import { type TokenStatus } from '@/hooks/useGmailOAuthFlow';

interface EmailAccountSelectorProps {
  accounts: EmailAccount[];
  activeAccountId: string | null;
  tokenStatus: Record<string, TokenStatus>;
  isSyncing: boolean;
  onSelectAccount: (id: string) => void;
  onAddAccount: () => void;
  onDisconnect: (id: string) => void;
  onSync: () => void;
  onSettings?: () => void;
  totalUnread?: number;
  className?: string;
}

const TOKEN_STATUS_CONFIG: Record<TokenStatus, { icon: typeof Wifi; color: string; label: string }> = {
  loading:      { icon: RefreshCw, color: 'text-muted-foreground', label: 'Verificando...' },
  valid:        { icon: Wifi, color: 'text-primary', label: 'Conectado' },
  expiring:     { icon: AlertTriangle, color: 'text-warning-foreground', label: 'Token expirando' },
  expired:      { icon: WifiOff, color: 'text-destructive', label: 'Sessão expirada — reconecte' },
  disconnected: { icon: WifiOff, color: 'text-muted-foreground', label: 'Desconectado' },
};

export function EmailAccountSelector({
  accounts,
  activeAccountId,
  tokenStatus,
  isSyncing,
  onSelectAccount,
  onAddAccount,
  onDisconnect,
  onSync,
  onSettings,
  totalUnread = 0,
  className,
}: EmailAccountSelectorProps) {
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const activeStatus = activeAccountId ? (tokenStatus[activeAccountId] ?? 'disconnected') : 'disconnected';
  const statusConfig = TOKEN_STATUS_CONFIG[activeStatus];
  const StatusIcon = statusConfig.icon;

  if (accounts.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn('gap-2 w-full', className)}
        onClick={onAddAccount}
      >
        <Plus className="h-4 w-4" />
        Conectar Email
      </Button>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 p-1 bg-background/40 rounded-xl border border-border/10 shadow-sm', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/80 transition-all duration-200 min-w-0 flex-1 group">
            <div className="relative shrink-0">
              <Avatar className="h-8 w-8 border border-primary/10 group-hover:border-primary/30 transition-colors">
                <AvatarImage src={activeAccount?.picture_url ?? ''} alt={activeAccount?.display_name ?? ''} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                  {(activeAccount?.email ?? '?')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* Status dot */}
              <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background shadow-sm',
                activeStatus === 'valid' && 'bg-success',
                activeStatus === 'expiring' && 'bg-warning',
                activeStatus === 'expired' && 'bg-destructive',
                (activeStatus === 'loading' || activeStatus === 'disconnected') && 'bg-muted',
              )} />
            </div>

            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-bold tracking-tight truncate leading-none mb-1">{activeAccount?.display_name ?? activeAccount?.email}</p>
              <div className="flex items-center gap-1">
                <p className="text-[10px] font-medium text-muted-foreground/70 truncate">{activeAccount?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {totalUnread > 0 && (
                <Badge className="h-4.5 min-w-[18px] text-[9px] font-black px-1 bg-primary text-primary-foreground border-none">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
            </div>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 bg-card/95 backdrop-blur-xl border-border/30 shadow-2xl">
          {/* Status do token */}
          <div className={cn('flex items-center gap-2 px-3 py-2 text-xs', statusConfig.color)}>
            <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', activeStatus === 'loading' && 'animate-spin')} />
            <span>{statusConfig.label}</span>
          </div>

          <DropdownMenuSeparator />

          {/* Outras contas */}
          {accounts.map(acc => {
            const status = tokenStatus[acc.id] ?? 'disconnected';
            const cfg = TOKEN_STATUS_CONFIG[status];
            const AccIcon = cfg.icon;

            return (
              <DropdownMenuItem
                key={acc.id}
                className={cn('gap-2', acc.id === activeAccountId && 'bg-muted/60')}
                onClick={() => onSelectAccount(acc.id)}
              >
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={acc.picture_url ?? ''} alt={acc.display_name ?? acc.email} />
                  <AvatarFallback className="text-[10px]">{acc.email[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{acc.display_name ?? acc.email}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{acc.email}</p>
                </div>
                <AccIcon className={cn('h-3.5 w-3.5 shrink-0', cfg.color)} />
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={onAddAccount} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar conta Email
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onSync} disabled={isSyncing} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
            Sincronizar agora
          </DropdownMenuItem>

          {onSettings && (
            <DropdownMenuItem onClick={onSettings} className="gap-2">
              <Settings className="h-4 w-4" />
              Configurar Email
            </DropdownMenuItem>
          )}

          {activeAccountId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onClick={() => onDisconnect(activeAccountId)}
              >
                <LogOut className="h-4 w-4" />
                Desconectar {activeAccount?.email}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sync button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={isSyncing ? 'Sincronizando...' : 'Sincronizar conta Gmail'}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Sincronizar inbox</TooltipContent>
      </Tooltip>
    </div>
  );
}
