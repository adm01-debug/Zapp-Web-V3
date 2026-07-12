/**
 * useSyncToCRM
 * 
 * Syncs completed conversations from zapp-web back to the external CRM.
 * Calls sync_interaction_from_zapp RPC which:
 * - Finds the contact by phone
 * - Creates an interaction record
 * - Recalculates relationship_score
 * - Deduplicates by zapp_conversation_id
 * 
 * Usage: call syncConversation() when a conversation is resolved/closed.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { log } from '@/lib/logger';

interface SyncParams {
  phone: string;
  channel?: string;
  direction?: string;
  assunto?: string;
  resumo?: string;
  conteudo?: string;
  sentiment?: string;
  messageCount?: number;
  durationSeconds?: number;
  agentName?: string;
  zappConversationId?: string;
}

interface SyncResult {
  synced: boolean;
  reason?: string;
  interaction_id?: string;
  contact_id?: string;
  company_id?: string;
  new_relationship_score?: number;
}

export function useSyncToCRM() {
  const queryClient = useQueryClient();

  const mutation = useMutation<SyncResult | null, Error, SyncParams>({
    mutationFn: async (params) => {
      if (!isExternalConfigured) return null;

      const { data, error } = await dbRpc(RPC.syncInteractionFromZapp, {
        p_phone: params.phone,
        p_channel: params.channel || 'whatsapp',
        p_direction: params.direction || 'inbound',
        p_assunto: params.assunto || null,
        p_resumo: params.resumo || null,
        p_conteudo: params.conteudo || null,
        p_sentiment: params.sentiment || 'neutral',
        p_message_count: params.messageCount || 0,
        p_duration_seconds: params.durationSeconds || null,
        p_agent_name: params.agentName || null,
        p_zapp_conversation_id: params.zappConversationId || null,
      });

      if (error) {
        log.error('CRM sync error:', error);
        throw error;
      }

      return data as SyncResult; // ignore-audit: dbRpc returns unknown, SyncResult is the documented RPC return shape
    },
    onSuccess: (result, params) => {
      if (result?.synced) {
        // Invalidate the 360° cache for this phone so it refreshes
        const cleanPhone = params.phone.replace(/[^0-9]/g, '');
        queryClient.invalidateQueries({ queryKey: ['external-contact-360', cleanPhone] });
        queryClient.invalidateQueries({ queryKey: ['external-contact-360-batch'] });
        log.info('CRM sync success:', result);
      }
    },
  });

  return {
    syncConversation: mutation.mutate,
    syncConversationAsync: mutation.mutateAsync,
    isSyncing: mutation.isPending,
    lastResult: mutation.data,
    isConfigured: isExternalConfigured,
  };
}
