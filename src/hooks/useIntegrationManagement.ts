// Consolidated Integration Management Module (ETAPA 42)
// Consolidates: useEvolutionApi, useGmailOAuthFlow, useBitrixApi, useTalkX, useSyncToCRM, useOnboarding
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';

interface Integration {
  id: string;
  type: string;
  name: string;
  is_active: boolean;
  config: Record<string, unknown>;
}

/** Manages Evolution API instance connections and configuration. */
export function useEvolutionApiManagement() {
  const [isConnected, setIsConnected] = useState(false);
  const [instances, setInstances] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const checkConnection = async () => {
      try {
        // SCHEMA: zapp — evolution_instances existe como view em zapp (security_invoker=on)
        // Não usar .schema('evo') — evo.evolution_instances não existe no DB (PGRST205).
        const { data, error: err } = await supabase.from('evolution_instances').select('*');

        if (cancelled) return;
        if (err) throw err;
        setInstances(data || []);
        setIsConnected((data || []).length > 0);
      } catch (err) {
        log.error('Error checking Evolution API connection:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isConnected, instances, loading };
}

/** Handles Gmail OAuth authentication flow and token management via the gmail-oauth Edge Function. */
export function useGmailOAuthFlowManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);

  const initiateOAuth = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-oauth', {
        body: { action: 'get-auth-url' },
      });
      if (error || !data?.url) {
        toast.error('Não foi possível iniciar a autenticação Gmail. Tente novamente.');
        log.error('gmail-oauth get-auth-url failed', { error });
        return;
      }

      const popup = window.open(data.url, 'gmail-oauth', 'width=520,height=640,scrollbars=yes');
      if (!popup) {
        toast.error('Popup bloqueado pelo navegador. Permita popups para este site e tente novamente.');
        return;
      }

      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type !== 'gmail-oauth-code') return;
        window.removeEventListener('message', handleMessage);

        const { code, state } = event.data as { code: string; state: string };
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Sessão expirada. Faça login novamente.');
          return;
        }

        const { data: exchangeData, error: exchangeError } = await supabase.functions.invoke('gmail-oauth', {
          body: { action: 'exchange-code', code, userId: user.id, state },
        });

        if (exchangeError || !exchangeData?.success) {
          toast.error('Falha ao conectar Gmail. Tente novamente.');
          log.error('gmail-oauth exchange-code failed', { error: exchangeError });
          return;
        }

        setIsAuthenticated(true);
        toast.success(`Gmail conectado: ${exchangeData.email}`);
      };

      window.addEventListener('message', handleMessage);
    } catch (err) {
      toast.error('Erro ao conectar Gmail. Tente novamente.');
      log.error('gmail-oauth initiateOAuth error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCallback = useCallback(async (_code: string) => {
    log.warn('handleCallback is a no-op — OAuth code is handled via postMessage in initiateOAuth');
  }, []);

  return { isAuthenticated, loading, initiateOAuth, handleCallback };
}

/** Manages Bitrix24 CRM API integration and connection status. */
export function useBitrixApiManagement() {
  const [isConnected, setIsConnected] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const checkBitrixConnection = async () => {
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'bitrix24')
          .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

        if (cancelled) return;
        if (err && err.code !== 'PGRST116') throw err;
        // config é JSONB: extrai webhook_url com guard de tipo.
        const config =
          data?.config && typeof data.config === 'object' && !Array.isArray(data.config)
            ? (data.config as Record<string, unknown>)
            : null;
        const webhookUrl =
          config && typeof config.webhook_url === 'string' ? config.webhook_url : null;
        if (webhookUrl) {
          setIsConnected(true);
          setWebhookUrl(webhookUrl);
        }
      } catch (err) {
        log.error('Error checking Bitrix connection:', err);
      }
    };

    checkBitrixConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isConnected, webhookUrl };
}

/** Fetches and manages TalkX integration configuration settings. */
export function useTalkXManagement() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchTalkXConfig = async () => {
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'talkx')
          .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

        if (cancelled) return;
        if (err && err.code !== 'PGRST116') throw err;
        if (data) {
          setIsEnabled(true);
          // config é JSONB: converte com guard (objeto → Record; demais → null).
          setConfig(
            data.config && typeof data.config === 'object' && !Array.isArray(data.config)
              ? (data.config as Record<string, unknown>)
              : null
          );
        }
      } catch (err) {
        log.error('Error fetching TalkX config:', err);
      }
    };

    fetchTalkXConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isEnabled, config };
}

/** Synchronizes entity data to external CRM systems. */
export function useSyncToCRMManagement(entityId?: string) {
  const [isSyncing] = useState(false);
  const [lastSyncAt] = useState<string | null>(null);

  const syncToCRM = useCallback(
    async (_data: Record<string, unknown>) => {
      if (!entityId) return;
      // GAP-3: sync_to_crm RPC not yet deployed to DB
      toast.error('Sincronização com CRM não disponível no momento.');
      log.warn('syncToCRM called but sync_to_crm RPC is not deployed', { entityId });
    },
    [entityId]
  );

  return { isSyncing, lastSyncAt, syncToCRM };
}

/** Re-exported module members. */
export type { Integration };
