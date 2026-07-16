// Consolidated Integration Management Module (ETAPA 42)
// Consolidates: useEvolutionApi, useGmailOAuthFlow, useBitrixApi, useTalkX, useSyncToCRM, useOnboarding
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

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
    let _mounted = true;
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
    setLoading(true);
    try {
      const { data, error: err } = await supabase.rpc('initiate_gmail_oauth');

      if (err) throw err;
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (err) {
      log.error('Error initiating Gmail OAuth:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCallback = useCallback(async (code: string) => {
    try {
      const { error: err } = await supabase.rpc('complete_gmail_oauth', { auth_code: code });

      if (err) throw err;
      setIsAuthenticated(true);
    } catch (err) {
      log.error('Error completing Gmail OAuth:', err);
    }
  }, []);

  return { isAuthenticated, loading, initiateOAuth, handleCallback };
}

/** Manages Bitrix24 CRM API integration and connection status. */
export function useBitrixApiManagement() {
  const [isConnected, setIsConnected] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    let _mounted = true;
    const checkBitrixConnection = async () => {
      if (!_mounted) return;
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'bitrix24')
          .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

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
    let _mounted = true;
    const fetchTalkXConfig = async () => {
      if (!_mounted) return;
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'talkx')
          .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const syncToCRM = useCallback(
    async (data: any) => {
      if (!entityId) return;

      setIsSyncing(true);
      try {
        const { error: err } = await supabase.rpc('sync_to_crm', {
          entity_id: entityId,
          entity_data: data,
        });

        if (err) throw err;
        setLastSyncAt(new Date().toISOString());
      } catch (err) {
        log.error('Error syncing to CRM:', err);
      } finally {
        setIsSyncing(false);
      }
    },
    [entityId]
  );

  return { isSyncing, lastSyncAt, syncToCRM };
}

export type { Integration };