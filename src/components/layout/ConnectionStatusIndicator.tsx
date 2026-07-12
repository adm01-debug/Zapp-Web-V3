import { useEffect, useRef, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import {
  supabase,
  isSupabaseConfigured,
  warnSupabaseUnconfigured,
} from '@/integrations/supabase/client';
import { WifiOff, Wifi, RefreshCw, History } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

const log = getLogger('ConnectionStatusIndicator');
const RECONNECT_COOLDOWN_MS = 30_000;
const HISTORY_STORAGE_KEY = 'zappweb:connection-disconnect-history';
const HISTORY_MAX_ENTRIES = 20;
const HISTORY_VISIBLE = 5;
const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const FILTER_STORAGE_KEY = 'zappweb:connection-popover-filter';
const SELECTED_STORAGE_KEY = 'zappweb:connection-popover-selected';

type FilterValue = 'all' | 'connected' | 'disconnected';

const loadFilter = (): FilterValue => {
  try {
    const v = localStorage.getItem(FILTER_STORAGE_KEY);
    if (v === 'connected' || v === 'disconnected' || v === 'all') return v;
  } catch {
    /* ignore */
  }
  return 'all';
};

const loadSelected = (): string | null => {
  try {
    return localStorage.getItem(SELECTED_STORAGE_KEY);
  } catch {
    return null;
  }
};

interface ConnectionRow {
  id: string;
  instance_id: string;
  instance_name: string | null;
  name: string | null;
  phone_number: string | null;
  status: string;
}

interface DisconnectEvent {
  instance_id: string;
  instance_name: string | null;
  name?: string | null;
  at: number; // epoch ms
}

interface Props {
  collapsed?: boolean;
}

const loadHistory = (): DisconnectEvent[] => {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DisconnectEvent[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - HISTORY_TTL_MS;
    return parsed.filter((e) => e && typeof e.at === 'number' && e.at >= cutoff);
  } catch {
    return [];
  }
};

const saveHistory = (events: DisconnectEvent[]) => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(events.slice(0, HISTORY_MAX_ENTRIES)));
  } catch {
    /* ignore quota errors */
  }
};

const formatRelative = (ts: number): string => {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const d = Math.floor(hr / 24);
  return `há ${d}d`;
};

/**
 * Indicador discreto de status das conexões WhatsApp.
 * Substitui o antigo banner vermelho fixo no topo da página.
 * - Verde: tudo conectado
 * - Âmbar: 1+ desconectada(s) — Popover com lista + ação Reconectar
 */
export function ConnectionStatusIndicator({ collapsed = false }: Props) {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [reconnectingAll, setReconnectingAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>(() => loadFilter());
  const [selectedInstance, setSelectedInstance] = useState<string | null>(() => loadSelected());
  const [history, setHistory] = useState<DisconnectEvent[]>(() => loadHistory());
  const cooldownRef = useRef<Map<string, number>>(new Map());
  const prevDisconnectedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const mountedRef = useMountedRef();

  // Persistir filtro
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, filter);
    } catch {
      /* ignore */
    }
  }, [filter]);

  // Persistir instância selecionada
  useEffect(() => {
    try {
      if (selectedInstance) localStorage.setItem(SELECTED_STORAGE_KEY, selectedInstance);
      else localStorage.removeItem(SELECTED_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [selectedInstance]);

  // Restaurar foco/scroll ao abrir
  useEffect(() => {
    if (!open || !selectedInstance) return;
    const t = setTimeout(() => {
      const el = itemRefs.current.get(selectedInstance);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(t);
  }, [open, selectedInstance, filter]);

  const fetchStatus = async () => {
    // App-shell component (lives in the Sidebar): without this guard it fires a
    // REST query on every mount, producing ERR_NAME_NOT_RESOLVED noise when
    // Supabase isn't configured. The realtime channel below is already inert.
    if (!isSupabaseConfigured) {
      warnSupabaseUnconfigured('ConnectionStatusIndicator');
      setLoading(false);
      return;
    }
    const { data, error } = (await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, instance_name, name, phone_number, status')) as unknown as {
      data: Array<{
        id: string;
        instance_id: string | null;
        instance_name: string | null;
        name: string | null;
        phone_number: string | null;
        status: string | null;
      }> | null;
      error: { message: string } | null;
    };
    if (error) {
      log.warn('Failed to fetch connections', { error: error.message });
      return;
    }
    if (!mountedRef.current) return;
    const rows: ConnectionRow[] = (data ?? []).map((r) => ({
      id: r.id,
      instance_id: r.instance_id || r.id,
      instance_name: r.instance_name ?? null,
      name: r.name ?? null,
      phone_number: r.phone_number,
      status: r.status ?? 'disconnected',
    }));
    setConnections(rows);
    setLoading(false);

    // Detect new disconnections → single toast per instance + record history
    const disconnectedRows = rows.filter((r) => r.status !== 'connected');
    const currentDisconnected = new Set(disconnectedRows.map((r) => r.instance_id));
    const rowByInstanceId = new Map(rows.map((r) => [r.instance_id, r]));
    if (initializedRef.current) {
      const newlyDown: DisconnectEvent[] = [];
      currentDisconnected.forEach((id) => {
        if (!prevDisconnectedRef.current.has(id)) {
          const row = rowByInstanceId.get(id);
          const displayName = (row ? evolutionInstanceName(row) : null) ?? row?.name ?? id;
          newlyDown.push({ instance_id: id, instance_name: row?.instance_name ?? null, name: row?.name ?? null, at: Date.now() });
          toast.warning(`Conexão "${displayName}" caiu`, {
            description: 'Mensagens podem não ser entregues. Clique no indicador para reconectar.',
            duration: 6000,
          });
        }
      });
      if (newlyDown.length > 0) {
        setHistory((prev) => {
          const next = [...newlyDown, ...prev].slice(0, HISTORY_MAX_ENTRIES);
          saveHistory(next);
          return next;
        });
      }
    }
    prevDisconnectedRef.current = currentDisconnected;
    initializedRef.current = true;
  };

  useEffect(() => {
    fetchStatus();
    const channel = supabase
      .channel('connection-status-indicator')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_connections' },
        () => {
          // Invalidate shared cache so other consumers (senders, dialogs) see fresh data.
          import('@/lib/whatsappConnectionsCache')
            .then((m) => m.invalidateWhatsappConnectionsCache())
            .catch(() => {});
          fetchStatus();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const reconnectInstance = async (
    conn: ConnectionRow,
    opts: { silent?: boolean } = {}
  ): Promise<{ ok: boolean; skipped?: boolean; error?: string; authError?: boolean }> => {
    const now = Date.now();
    const lastAttempt = cooldownRef.current.get(conn.instance_id) ?? 0;
    if (now - lastAttempt < RECONNECT_COOLDOWN_MS) {
      const wait = Math.ceil((RECONNECT_COOLDOWN_MS - (now - lastAttempt)) / 1000);
      if (!opts.silent) toast.info(`Aguarde ${wait}s antes de tentar novamente.`);
      return { ok: false, skipped: true };
    }
    cooldownRef.current.set(conn.instance_id, now);
    // Evolution API roteia por NOME; o UUID (instance_id) gera 404 + auto-create
    // de instância fantasma (incidente wpp2 2026-07-04). Sem nome → não chamar.
    const instanceName = evolutionInstanceName({
      instance_name: conn.instance_name,
      instance_id: conn.instance_id,
    });
    if (!instanceName) {
      const msg = 'Conexão sem nome de instância cadastrado — reconexão automática bloqueada.';
      if (!opts.silent) toast.error(msg);
      log.warn(msg, { instance_id: conn.instance_id });
      return { ok: false, error: msg };
    }
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'connect', instanceName },
      });
      if (error) throw new Error(error.message || 'Falha ao invocar evolution-api');
      if (data?.error === true) {
        const code = typeof data?.code === 'string' ? data.code : null;
        const message = data?.message || 'Erro Evolution API';
        if (code === 'EVOLUTION_AUTH_ERROR') {
          if (!opts.silent) toast.error(`Sem autorização: ${message}`, { duration: 8000 });
          return { ok: false, authError: true, error: message };
        }
        throw new Error(message);
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      log.error('Reconnect failed', { instance: conn.instance_id, error: msg });
      return { ok: false, error: msg };
    }
  };

  const handleReconnect = async (conn: ConnectionRow) => {
    setSelectedInstance(conn.instance_id);
    setReconnecting(conn.instance_id);
    const result = await reconnectInstance(conn);
    setReconnecting(null);
    if (result.ok) {
      const displayName = conn.instance_name || conn.name || conn.instance_id;
      toast.success(`Reconectando ${displayName}…`);
      window.dispatchEvent(new CustomEvent('navigate-view', { detail: 'connections' }));
      setOpen(false);
    } else if (!result.skipped && !result.authError) {
      toast.error(`Erro: ${result.error ?? 'desconhecido'}`);
    }
  };

  const handleReconnectAll = async () => {
    const targets = connections.filter((c) => c.status !== 'connected');
    if (targets.length === 0) return;
    setReconnectingAll(true);
    let success = 0;
    let skipped = 0;
    let failed = 0;
    let authErr = 0;
    for (let i = 0; i < targets.length; i++) {
      const conn = targets[i];
      setReconnecting(conn.instance_id);
      const r = await reconnectInstance(conn, { silent: true });
      if (r.ok) success++;
      else if (r.skipped) skipped++;
      else if (r.authError) authErr++;
      else failed++;
      // Throttle entre chamadas pra não sobrecarregar a edge function
      if (i < targets.length - 1) await new Promise((res) => setTimeout(res, 400));
    }
    setReconnecting(null);
    setReconnectingAll(false);

    const parts: string[] = [];
    if (success > 0) parts.push(`${success} reconectando`);
    if (skipped > 0) parts.push(`${skipped} em cooldown`);
    if (failed > 0) parts.push(`${failed} com erro`);
    if (authErr > 0) parts.push(`${authErr} sem autorização`);
    const summary = parts.join(' · ') || 'Nenhuma ação executada';

    if (success > 0 && failed === 0 && authErr === 0) {
      toast.success(`Reconectando todas: ${summary}`);
      window.dispatchEvent(new CustomEvent('navigate-view', { detail: 'connections' }));
      setOpen(false);
    } else if (success > 0) {
      toast.warning(`Reconexão parcial: ${summary}`, { duration: 7000 });
    } else {
      toast.error(`Falha ao reconectar: ${summary}`, { duration: 7000 });
    }
  };

  if (loading || connections.length === 0) return null;

  const disconnected = connections.filter((c) => c.status !== 'connected');
  const total = connections.length;
  const connected = total - disconnected.length;
  const hasIssue = disconnected.length > 0;

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
          : 'border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 dark:text-primary'
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
        className="w-72 border-border bg-foreground p-0 shadow-none"
      >
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
        {/* Filtro segmentado */}
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

        <ul className="max-h-72 overflow-auto py-1" role="list">
          {(() => {
            const filtered = connections.filter((c) => {
              if (filter === 'connected') return c.status === 'connected';
              if (filter === 'disconnected') return c.status !== 'connected';
              return true;
            });
            if (filtered.length === 0) {
              return (
                <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                  Nenhuma conexão {filter === 'connected' ? 'conectada' : 'desconectada'}.
                </li>
              );
            }
            return filtered.map((c) => {
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
                        {c.instance_name || c.name || c.instance_id}
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
            });
          })()}
        </ul>
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
                  <span className="truncate text-foreground/80">{ev.instance_name || ev.name || ev.instance_id}</span>
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
      </PopoverContent>
    </Popover>
  );
}
