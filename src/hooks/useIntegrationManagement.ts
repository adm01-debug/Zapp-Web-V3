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

export function useEvolutionApiManagement() {
  const [isConnected, setIsConnected] = useState(false);
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConnection = async () => {
      try {
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

export function useBitrixApiManagement() {
  const [isConnected, setIsConnected] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    const checkBitrixConnection = async () => {
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'bitrix24')
          .single();

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

export function useTalkXManagement() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    const fetchTalkXConfig = async () => {
      try {
        const { data, error: err } = await supabase
          .from('integrations')
          .select('config')
          .eq('type', 'talkx')
          .single();

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
