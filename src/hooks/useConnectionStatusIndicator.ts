import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  supabase,
  isSupabaseConfigured,
  warnSupabaseUnconfigured,
} from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import {
  RECONNECT_COOLDOWN_MS,
  HISTORY_MAX_ENTRIES,
  loadFilter,
  loadSelected,
  loadHistory,
  saveHistory,
  type FilterValue,
  type ConnectionRow,
  type DisconnectEvent,
} from '@/components/layout/connectionStatusStorage';

const log = getLogger('ConnectionStatusIndicator');

const CONNECTIONS_STATUS_KEY = ['whatsapp-connections-status'] as const;

/** use Connection Status Indicator component for the layout section. */
export function useConnectionStatusIndicator() {
  const queryClient = useQueryClient();
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

  const { data: connections = [], isLoading: loading, isSuccess } = useQuery({
    queryKey: CONNECTIONS_STATUS_KEY,
    queryFn: async () => {
      if (!isSupabaseConfigured) {
        warnSupabaseUnconfigured('ConnectionStatusIndicator');
        return [] as ConnectionRow[];
      }
      const { data, error } = (await supabase
        .from('whatsapp_connections')
        .select('id, instance_id, instance_name, name, phone_number, status')) as unknown as {
        // ignore-audit — Supabase select returns PostgrestSingleResponse with generic Row; casting to selected-columns shape
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
        return [] as ConnectionRow[];
      }
      return (data ?? []).map((r) => ({
        id: r.id,
        instance_id: r.instance_id || r.id,
        instance_name: r.instance_name ?? null,
        name: r.name ?? null,
        phone_number: r.phone_number,
        status: r.status ?? 'disconnected',
      }));
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    try {
      localStorage.setItem('zappweb:connection-popover-filter', filter);
      if (selectedInstance) {
        localStorage.setItem('zappweb:connection-popover-selected', selectedInstance);
      } else {
        localStorage.removeItem('zappweb:connection-popover-selected');
      }
    } catch {
      /* ignore */
    }
  }, [filter, selectedInstance]);

  useEffect(() => {
    if (!open || !selectedInstance) return;
    const callback = () => {
      const el = itemRefs.current.get(selectedInstance);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(callback, { timeout: 500 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(callback, 50);
    return () => clearTimeout(t);
  }, [open, selectedInstance]);

  // Disconnect detection: guard with isSuccess to avoid premature initialization
  // before real server data arrives (connections defaults to [] before query resolves).
  useEffect(() => {
    if (!isSuccess) return;

    const disconnectedRows = connections.filter((r) => r.status !== 'connected');
    const currentDisconnected = new Set(disconnectedRows.map((r) => r.instance_id));

    if (initializedRef.current && currentDisconnected.size > 0) {
      const newlyDown: DisconnectEvent[] = [];
      const rowByInstanceId = new Map(disconnectedRows.map((r) => [r.instance_id, r]));
      currentDisconnected.forEach((id) => {
        if (!prevDisconnectedRef.current.has(id)) {
          const row = rowByInstanceId.get(id);
          const displayName = (row ? evolutionInstanceName(row) : null) ?? row?.name ?? id;
          newlyDown.push({
            instance_id: id,
            instance_name: row?.instance_name ?? null,
            name: row?.name ?? null,
            at: Date.now(),
          });
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
  }, [connections, isSuccess]);

  // Realtime subscription — invalidates the query on any connection change.
  useEffect(() => {
    const channel = supabase
      .channel('connection-status-indicator')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'whatsapp_connections' }, () => {
        import('@/lib/whatsappConnectionsCache')
          .then((m) => m.invalidateWhatsappConnectionsCache())
          .catch(() => {});
        void queryClient.invalidateQueries({ queryKey: CONNECTIONS_STATUS_KEY });
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
      const displayName = evolutionInstanceName(conn) ?? conn.name ?? conn.instance_id;
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

  const disconnected = connections.filter((c) => c.status !== 'connected');
  const total = connections.length;
  const connected = total - disconnected.length;
  const hasIssue = disconnected.length > 0;

  return {
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
  };
}
