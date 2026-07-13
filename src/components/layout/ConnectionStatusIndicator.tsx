/**
 * Indicador discreto de status das conexões WhatsApp.
 * - Verde: tudo conectado
 * - Âmbar/vermelho: 1+ desconectada(s) — Popover com lista + ação Reconectar
 *
 * Toda lógica de estado, fetch e reconexão vive em `useConnectionStatusIndicator`.
 * O corpo do Popover é renderizado por `ConnectionPopoverContent`.
 */
import { WifiOff, Wifi } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useConnectionStatusIndicator } from './useConnectionStatusIndicator';
import { ConnectionPopoverContent } from './ConnectionPopoverContent';

interface Props {
  collapsed?: boolean;
}

export function ConnectionStatusIndicator({ collapsed = false }: Props) {
  const {
    connections,
    loading,
    reconnecting,
    reconnectingAll,
    open,
    setOpen,
    filter,
    setFilter,
    selectedInstance,
    setSelectedInstance,
    history,
    setHistory,
    itemRefs,
    disconnected,
    total,
    connected,
    hasIssue,
    handleReconnect,
    handleReconnectAll,
  } = useConnectionStatusIndicator();

  if (loading || connections.length === 0) return null;

  const triggerLabel = hasIssue
    ? `${disconnected.length} conexão${disconnected.length > 1 ? 'ões' : ''} offline`
    : 'Conexões WhatsApp ativas';

  const button = (
    <button
      type="button"
      aria-label={triggerLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        collapsed ? 'h-9 w-9 justify-center' : 'h-7 px-2',
        hasIssue
          ? 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'
          : 'border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15'
      )}
    >
      {hasIssue ? (
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Wifi className="h-3.5 w-3.5 shrink-0" />
      )}
      {!collapsed && (
        <span className="text-[11px] font-semibold tabular-nums leading-none">
          {connected}/{total}
        </span>
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs">
          {triggerLabel}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        className="w-72 border-border bg-popover p-0 shadow-md"
      >
        <ConnectionPopoverContent
          connections={connections}
          filter={filter}
          setFilter={setFilter}
          selectedInstance={selectedInstance}
          setSelectedInstance={setSelectedInstance}
          disconnected={disconnected}
          connected={connected}
          total={total}
          reconnecting={reconnecting}
          reconnectingAll={reconnectingAll}
          handleReconnect={handleReconnect}
          handleReconnectAll={handleReconnectAll}
          history={history}
          setHistory={setHistory}
          itemRefs={itemRefs}
        />
      </PopoverContent>
    </Popover>
  );
}
