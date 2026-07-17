// Consolidated Integration Management Module (ETAPA 42)
// Consolidates: useEvolutionApi, useGmailOAuthFlow, useBitrixApi, useTalkX, useSyncToCRM, useOnboarding
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';

interface Integration {
  id: string;
  type: string;
  name: string;
  is_active: boolean;
  config: Record<string, any>;
}

/** Manages Evolution API instance connections and configuration. */
export function useEvolutionApiManagement() {
  const [isConnected, setIsConnected] = useState(false);
  const [instances, setInstances] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const _mounted = true;
    const checkConnection = async () => {
      if (!_mounted) return;
      try {
        // SCHEMA: zapp — evolution_instances existe como view em zapp (security_invoker=on)
        // Não usar .schema('evo') — evo.evolution_instances não existe no DB (PGRST205).
        const { data, error: err } = await supabase.from('evolution_instances').select('*');

        if (err) throw err;
        setInstances(data || []);
        setIsConnected((data || []).length > 0);
      } catch (err) {
        log.error('Error checking Evolution API connection:', err);
      } finally {
        setLoading(false);
      }
    };

    checkConnection();
  }, []);

  return { isConnected, instances, loading };
}

/** Handles Gmail OAuth authentication flow and token management. */
export function useGmailOAuthFlowManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);

  const initiateOAuth = useCallback(async () => {
    // GAP-2: initiate_gmail_oauth RPC not yet deployed to DB
    toast.error('Integração Gmail não disponível no momento. Entre em contato com o suporte.');
    log.warn('initiateOAuth called but initiate_gmail_oauth RPC is not deployed');
  }, []);

  const handleCallback = useCallback(async (_code: string) => {
    // GAP-2: complete_gmail_oauth RPC not yet deployed to DB
    toast.error('Integração Gmail não disponível no momento. Entre em contato com o suporte.');
    log.warn('handleCallback called but complete_gmail_oauth RPC is not deployed');
  }, []);

  return { isAuthenticated, loading, initiateOAuth, handleCallback };
}

/** Manages Bitrix24 CRM API integration and connection status. */
export function useBitrixApiManagement() {
  const [isConnected, setIsConnected] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    const _mounted = true;
    const checkBitrixConnection = async () => {
      if (!_mounted) return;
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'bitrix24')
          .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

        if (err && err.code !== 'PGRST116') throw err;
        if (data?.config?.webhook_url) {
          setIsConnected(true);
          setWebhookUrl(data.config.webhook_url);
        }
      } catch (err) {
        log.error('Error checking Bitrix connection:', err);
      }
    };

    checkBitrixConnection();
  }, []);

  return { isConnected, webhookUrl };
}

/** Fetches and manages TalkX integration configuration settings. */
export function useTalkXManagement() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    const _mounted = true;
    const fetchTalkXConfig = async () => {
      if (!_mounted) return;
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'talkx')
          .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

        if (err && err.code !== 'PGRST116') throw err;
        if (data) {
          setIsEnabled(true);
          setConfig(data.config);
        }
      } catch (err) {
        log.error('Error fetching TalkX config:', err);
      }
    };

    fetchTalkXConfig();
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

export type { Integration };
