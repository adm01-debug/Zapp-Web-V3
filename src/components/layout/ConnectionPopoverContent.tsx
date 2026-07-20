import { RefreshCw, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import {
  saveHistory,
  formatRelative,
  HISTORY_VISIBLE,
  type FilterValue,
  type ConnectionRow,
  type DisconnectEvent,
} from './connectionStatusStorage';

interface Props {
  connections: ConnectionRow[];
  filter: FilterValue;
  setFilter: (v: FilterValue) => void;
  selectedInstance: string | null;
  setSelectedInstance: (id: string) => void;
  disconnected: ConnectionRow[];
  connected: number;
  total: number;
  reconnecting: string | null;
  reconnectingAll: boolean;
  handleReconnect: (conn: ConnectionRow) => void;
  handleReconnectAll: () => void;
  history: DisconnectEvent[];
  setHistory: React.Dispatch<React.SetStateAction<DisconnectEvent[]>>;
  itemRefs: React.MutableRefObject<Map<string, HTMLLIElement>>;
}

/** Connection Popover Content component for the layout section. */
export function ConnectionPopoverContent({
  connections,
  filter,
  setFilter,
  selectedInstance,
  setSelectedInstance,
  disconnected,
  connected,
  total,
  reconnecting,
  reconnectingAll,
  handleReconnect,
  handleReconnectAll,
  history,
  setHistory,
  itemRefs,
}: Props) {
  const filtered = connections.filter((c) => {
    if (filter === 'connected') return c.status === 'connected';
    if (filter === 'disconnected') return c.status !== 'connected';
    return true;
  });

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">WhatsApp — Conexões</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {connected} de {total} conectada{total > 1 ? 's' : ''}
          </p>
        </div>
        {disconnected.length > 1 && (
          <button
            type="button"
            onClick={handleReconnectAll}
            disabled={reconnectingAll || reconnecting !== null}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:opacity-50"
            aria-label={`Reconectar todas as ${disconnected.length} instâncias desconectadas`}
          >
            <RefreshCw className={cn('h-3 w-3', reconnectingAll && 'animate-spin')} />
            Reconectar todas ({disconnected.length})
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="Filtrar conexões por status"
        className="flex items-center gap-1 border-b border-border px-3 py-1.5"
      >
        {(
          [
            { key: 'all', label: 'Todas', count: total },
            { key: 'connected', label: 'Conectadas', count: connected },
            { key: 'disconnected', label: 'Offline', count: disconnected.length },
          ] as const
        ).map(({ key, label, count }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                active
                  ? 'border border-primary/30 bg-primary/10 text-primary'
                  : 'border border-transparent text-muted-foreground hover:bg-muted/60'
              )}
            >
              {label}
              <span
                className={cn('text-[9px] tabular-nums', active ? 'opacity-100' : 'opacity-70')}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Connections list */}
      <ul className="max-h-72 overflow-auto py-1" role="list">
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            Nenhuma conexão {filter === 'connected' ? 'conectada' : 'desconectada'}.
          </li>
        ) : (
          filtered.map((c) => {
            const isOk = c.status === 'connected';
            const isReconn = reconnecting === c.instance_id;
            const isSelected = selectedInstance === c.instance_id;
            return (
              <li
                key={c.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(c.instance_id, el);
                  else itemRefs.current.delete(c.instance_id);
                }}
                onClick={() => setSelectedInstance(c.instance_id)}
                aria-current={isSelected ? 'true' : undefined}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors',
                  isSelected
                    ? 'border-l-2 border-primary bg-primary/10'
                    : 'border-l-2 border-transparent hover:bg-muted/10'
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      isOk ? 'bg-primary' : 'animate-pulse bg-destructive'
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {evolutionInstanceName(c) ?? c.name ?? c.instance_id}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {c.phone_number || (isOk ? 'Online' : 'Desconectada')}
                    </p>
                  </div>
                </div>
                {!isOk && (
                  <button
                    type="button"
                    onClick={() => handleReconnect(c)}
                    disabled={isReconn || reconnectingAll}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                  >
                    <RefreshCw className={cn('h-3 w-3', isReconn && 'animate-spin')} />
                    Reconectar
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3 w-3" aria-hidden="true" />
              Últimas quedas
            </div>
            <button
              type="button"
              onClick={() => {
                setHistory([]);
                saveHistory([]);
              }}
              className="rounded px-1 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Limpar histórico de quedas"
            >
              Limpar
            </button>
          </div>
          <ul className="space-y-0.5" role="list">
            {history.slice(0, HISTORY_VISIBLE).map((ev, idx) => (
              <li
                key={`${ev.instance_id}-${ev.at}-${idx}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-foreground/80">
                  {evolutionInstanceName(ev) ?? ev.name ?? ev.instance_id}
                </span>
                <span
                  className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                  title={new Date(ev.at).toLocaleString()}
                >
                  {formatRelative(ev.at)}
                </span>
              </li>
            ))}
          </ul>
          {history.length > HISTORY_VISIBLE && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              +{history.length - HISTORY_VISIBLE} eventos anteriores
            </p>
          )}
        </div>
      )}
    </>
  );
}
