import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logChannelError } from '@/integrations/supabase/channelErrorLogging';
import { getLogger } from '@/lib/logger';
import { queryKeys } from '@/services/api/queryKeys';

const log = getLogger('useConversationReactionsRealtime');

/**
 * Assina UM ÚNICO canal realtime de `message_reactions` por conversa.
 * Quando chega um INSERT/UPDATE/DELETE cuja `message_id` pertence ao set
 * de mensagens visíveis, invalida a query de reações daquela mensagem.
 *
 * Mantemos a lista de IDs em um ref para não recriar a subscription
 * a cada nova mensagem que entra na conversa.
 */
export function useConversationReactionsRealtime(
  conversationId: string | undefined,
  messageIds: string[]
) {
  const queryClient = useQueryClient();
  const idsRef = useRef<Set<string>>(new Set(messageIds));

  useEffect(() => {
    idsRef.current = new Set(messageIds);
  }, [messageIds]);

  useEffect(() => {
    if (!conversationId) return;

    // Última conexão bem-sucedida do canal (status SUBSCRIBED) — usada para
    // classificar CHANNEL_ERROR transiente vs real (mesmo padrão dos demais
    // canais realtime).
    let lastConnectedAtMs: number | null = null;

    const channel = supabase
      .channel(`conv-reactions:${conversationId}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'message_reactions' },
        (payload) => {
          const newRow = payload.new as { message_id?: string } | null;
          const oldRow = payload.old as { message_id?: string } | null;
          const messageId = newRow?.message_id ?? oldRow?.message_id;
          if (!messageId) return;
          if (!idsRef.current.has(messageId)) return;
          queryClient.invalidateQueries({
            queryKey: queryKeys.messageReactions.message(messageId),
          });
        }
      )
      .subscribe((status) => {
        // FIX 2026-08-07 (validação onda-v2): CHANNEL_ERROR transiente (restart
        // do Kong/reconexão do supabase-js) logava log.error cru por conversa —
        // mesmo ruído que os outros canais tinham. Usa a classificação central:
        // debug (transiente <30s), info (backend-down/offline), warn (real).
        if (status === 'SUBSCRIBED') {
          lastConnectedAtMs = Date.now();
        } else if (status === 'CHANNEL_ERROR') {
          void logChannelError(log, 'Falha ao assinar canal de reações', lastConnectedAtMs, {
            conversationId,
          });
        }
      });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [conversationId, queryClient]);
}
