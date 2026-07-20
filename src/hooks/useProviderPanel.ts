import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';

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

interface ProviderPanelData {
  rows: ProviderRow[];
  logs: ProviderLog[];
}

export function useProviderPanel() {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ['provider-panel', selectedProviderId] as const;

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: async (): Promise<ProviderPanelData> => {
      const [{ data: panelData }, { data: logsData }] = await Promise.all([
        safeClient.rpc<ProviderRow[]>('rpc_provider_panel'),
        safeClient.rpc<ProviderLog[]>('rpc_provider_session_timeline', {
          p_provider_id: selectedProviderId,
          p_session_id: null,
          p_limit: 100,
        }),
      ]);
      return { rows: panelData ?? [], logs: logsData ?? [] };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const rows = data?.rows ?? [];
  const logs = data?.logs ?? [];

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, selectedProviderId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const upsertProvider = async (
    payload: Partial<ProviderRow> & { id?: string; auth_token?: string }
  ) => {
    const { id, ...rest } = payload;
    const data = {
      name: rest.name,
      provider_type: rest.provider_type,
      base_url: rest.base_url,
      auth_token: rest.auth_token ?? null,
      priority: rest.priority ?? 10,
      is_active: rest.is_active ?? true,
    };
    const { error } = id
      ? await safeClient.from('provider_configs', (q) => q.update(data).eq('id', id))
      : await safeClient.from('provider_configs', (q) => q.insert(data));
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: id ? 'Provedor atualizado' : 'Provedor criado' });
    void queryClient.invalidateQueries({ queryKey });
    return true;
  };

  const deleteProvider = async (id: string) => {
    const { error } = await safeClient.from('provider_configs', (q) => q.delete().eq('id', id));
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Provedor removido' });
    void queryClient.invalidateQueries({ queryKey });
  };

  const runHealthcheck = async () => {
    const { data: fnData, error } = await supabase.functions.invoke('provider-healthcheck', { body: {} });
    if (error) {
      toast({ title: 'Falha no healthcheck', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Healthcheck executado',
      description: `${fnData?.checked ?? 0} provedor(es) verificado(s).`,
    });
    void queryClient.invalidateQueries({ queryKey });
  };

  return {
    rows,
    logs,
    loading,
    selectedProviderId,
    setSelectedProviderId,
    refetch,
    upsertProvider,
    deleteProvider,
    runHealthcheck,
  };
}
