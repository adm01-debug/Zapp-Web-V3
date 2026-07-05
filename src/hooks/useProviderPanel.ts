import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { dbRpc, dbFrom } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';

export type ProviderType = 'evolution' | 'wppconnect' | 'baileys' | 'custom';

export interface ProviderRow {
  provider_id: string;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  is_active: boolean;
  priority: number;
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  last_ping_at: string | null;
  last_ping_latency_ms: number | null;
  last_error: string | null;
  open_sessions: number;
  events_24h: number;
  errors_24h: number;
  routes_primary: number;
  routes_fallback: number;
  routes_active: number;
}

export interface ProviderLog {
  log_id: string;
  session_id: string | null;
  provider_id: string;
  provider_name: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  message: string | null;
  latency_ms: number | null;
  created_at: string;
}

export function useProviderPanel() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [logs, setLogs] = useState<ProviderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const { toast } = useToast();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchPanel = useCallback(async () => {
    setLoading(true);
    const [{ data: panelData }, { data: logsData }] = await Promise.all([
      dbRpc(RPC.providerPanel, {}),
      dbRpc(RPC.providerSessionTimeline, {
        p_provider_id: selectedProviderId,
        p_session_id: null,
        p_limit: 100,
      }),
    ]);
    if (!mountedRef.current) return;
    setRows((panelData as ProviderRow[]) ?? []);
    setLogs((logsData as ProviderLog[]) ?? []);
    setLoading(false);
  }, [selectedProviderId]);

  useEffect(() => {
    fetchPanel();
    const id = setInterval(fetchPanel, 30_000);
    return () => clearInterval(id);
  }, [fetchPanel]);

  const upsertProvider = async (payload: Partial<ProviderRow> & { id?: string; auth_token?: string }) => {
    const { id, ...rest } = payload;
    const data = {
      name: rest.name,
      provider_type: rest.provider_type,
      base_url: rest.base_url,
      auth_token: rest.auth_token ?? null,
      priority: rest.priority ?? 10,
      is_active: rest.is_active ?? true,
    };
    const op = id
      ? dbFrom('provider_configs').update(data).eq('id', id)
      : dbFrom('provider_configs').insert(data);
    const { error } = await op;
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: id ? 'Provedor atualizado' : 'Provedor criado' });
    fetchPanel();
    return true;
  };

  const deleteProvider = async (id: string) => {
    const { error } = await dbFrom('provider_configs').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Provedor removido' });
    fetchPanel();
  };

  const runHealthcheck = async () => {
    const { data, error } = await supabase.functions.invoke('provider-healthcheck', { body: {} });
    if (error) {
      toast({ title: 'Falha no healthcheck', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Healthcheck executado', description: `${data?.checked ?? 0} provedor(es) verificado(s).` });
    fetchPanel();
  };

  return {
    rows, logs, loading, selectedProviderId, setSelectedProviderId,
    refetch: fetchPanel, upsertProvider, deleteProvider, runHealthcheck,
  };
}