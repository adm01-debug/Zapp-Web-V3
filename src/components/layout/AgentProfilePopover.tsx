import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Circle, Clock, MinusCircle, Settings, LogOut } from 'lucide-react';

interface AgentProfilePopoverProps {
  agent: { name: string; avatar?: string; status: 'online' | 'away' | 'offline' };
  collapsed: boolean;
  statusOpen: boolean;
  onStatusOpenChange: (open: boolean) => void;
  onStatusChange?: (status: 'online' | 'away' | 'offline') => void;
  onViewChange: (view: string) => void;
  onLogout?: () => void;
}

const STATUS_OPTIONS = [
  { status: 'online' as const, label: 'Online', icon: Circle, color: 'text-[hsl(var(--online))]' },
  { status: 'away' as const, label: 'Ausente', icon: Clock, color: 'text-[hsl(var(--away))]' },
  {
    status: 'offline' as const,
    label: 'Offline',
    icon: MinusCircle,
    color: 'text-[hsl(var(--offline))]',
  },
] as const;

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  away: 'Ausente',
  offline: 'Offline',
};

export function AgentProfilePopover({
  agent,
  collapsed,
  statusOpen,
  onStatusOpenChange,
  onStatusChange,
  onViewChange,
  onLogout,
}: AgentProfilePopoverProps) {
  return (
    <Popover open={statusOpen} onOpenChange={onStatusOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group relative flex items-center gap-2.5 rounded-lg transition-colors hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            collapsed ? 'justify-center p-1' : 'w-full px-3 py-1.5'
          )}
          aria-label="Status e perfil"
        >
          <Avatar className="h-[32px] w-[32px] shrink-0 ring-2 ring-transparent transition-all group-hover:ring-primary/30">
            <AvatarImage src={agent.avatar} alt={agent.name} />
            <AvatarFallback className="bg-primary/15 text-[11px] font-semibold text-primary">
              {agent.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              'absolute h-2.5 w-2.5 rounded-full border-2 border-border',
              collapsed ? '-bottom-0.5 -right-0.5' : 'bottom-1 left-[30px]',
              agent.status === 'online' && 'bg-[hsl(var(--online))]',
              agent.status === 'away' && 'bg-[hsl(var(--away))]',
              agent.status === 'offline' && 'bg-[hsl(var(--offline))]'
            )}
          />
          {!collapsed && (
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-xs font-medium leading-tight text-foreground">
                {agent.name}
              </span>
              <span
                className={cn(
                  'text-[10px] capitalize leading-tight',
                  agent.status === 'online' && 'text-[hsl(var(--online))]',
                  agent.status === 'away' && 'text-[hsl(var(--away))]',
                  agent.status === 'offline' && 'text-muted-foreground'
                )}
              >
                {STATUS_LABELS[agent.status]}
              </span>
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        sideOffset={12}
        align="end"
        className="w-48 border-border bg-foreground p-2 shadow-none"
      >
        <div className="mb-1 px-2 py-1.5">
          <p className="truncate text-xs font-semibold text-foreground">{agent.name}</p>
        </div>
        <div className="space-y-0.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.status}
              onClick={() => {
                onStatusChange?.(opt.status);
                onStatusOpenChange(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                agent.status === opt.status
                  ? 'bg-muted/20 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/10 hover:text-foreground'
              )}
            >
              <opt.icon className={cn('h-3.5 w-3.5', opt.color)} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-1 space-y-0.5 border-t border-border/50 pt-1">
          <button
            type="button"
            onClick={() => {
              onViewChange('settings');
              onStatusOpenChange(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/10 hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            Configurações
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={() => {
                onLogout();
                onStatusOpenChange(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair da conta
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
