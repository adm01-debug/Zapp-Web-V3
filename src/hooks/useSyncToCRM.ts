/**
 * useSyncToCRM — contrato completo consumido por CRMAutoSync/CRMSyncButton.
 *
 * Expõe:
 *   - syncConversation (fire-and-forget)
 *   - syncConversationAsync (retorna resultado)
 *   - isSyncing / isConfigured / lastResult / lastSyncAt
 *
 * A chamada real vai para a RPC `sync_conversation_to_crm` (schema `zapp`).
 * Se a RPC não existir na instância, `isConfigured` = false e o botão/efeito
 * ficam inertes — nada de erro em tela.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useSyncToCRM');

export interface SyncConversationInput {
  phone: string;
  channel: 'whatsapp' | 'email' | 'sms' | string;
  direction: 'inbound' | 'outbound';
  assunto?: string;
  resumo?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | string;
  messageCount?: number;
  agentName?: string;
  zappConversationId?: string;
}

export interface SyncConversationResult {
  synced: boolean;
  reason?: 'duplicate' | 'contact_not_found' | 'not_configured' | 'error';
  new_relationship_score?: number | null;
  [key: string]: unknown;
}

export interface UseSyncToCRMReturn {
  isSyncing: boolean;
  isConfigured: boolean;
  lastResult: SyncConversationResult | null;
  lastSyncAt: Date | null;
  syncConversation: (input: SyncConversationInput) => void;
  syncConversationAsync: (input: SyncConversationInput) => Promise<SyncConversationResult>;
}

async function callSyncRpc(input: SyncConversationInput): Promise<SyncConversationResult> {
  // Usa `as any` só na fronteira porque a RPC pode ainda não estar tipada nos types gerados.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>
  )('sync_conversation_to_crm', {
    p_phone: input.phone,
    p_channel: input.channel,
    p_direction: input.direction,
    p_assunto: input.assunto ?? null,
    p_resumo: input.resumo ?? null,
    p_sentiment: input.sentiment ?? 'neutral',
    p_message_count: input.messageCount ?? 0,
    p_agent_name: input.agentName ?? null,
    p_zapp_conversation_id: input.zappConversationId ?? null,
  });

  if (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'PGRST202' || err.code === '42883') {
      return { synced: false, reason: 'not_configured' };
    }
    log.error('sync_conversation_to_crm error', err);
    return { synced: false, reason: 'error' };
  }

  const result = (
    data && typeof data === 'object' ? data : { synced: false }
  ) as SyncConversationResult;
  return { ...result, synced: !!result.synced };
}

export function useSyncToCRM(): UseSyncToCRMReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true); // otimista até a 1ª chamada dizer o contrário
  const [lastResult, setLastResult] = useState<SyncConversationResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncConversationAsync = useCallback(async (input: SyncConversationInput) => {
    setIsSyncing(true);
    try {
      const result = await callSyncRpc(input);
      if (!mountedRef.current) return result;
      setLastResult(result);
      if (result.reason === 'not_configured') setIsConfigured(false);
      if (result.synced) setLastSyncAt(new Date());
      return result;
    } finally {
      if (mountedRef.current) setIsSyncing(false);
    }
  }, []);

  const syncConversation = useCallback(
    (input: SyncConversationInput) => {
      void syncConversationAsync(input).catch((err) => log.error('syncConversation failed', err));
    },
    [syncConversationAsync]
  );

  return {
    isSyncing,
    isConfigured,
    lastResult,
    lastSyncAt,
    syncConversation,
    syncConversationAsync,
  };
}
