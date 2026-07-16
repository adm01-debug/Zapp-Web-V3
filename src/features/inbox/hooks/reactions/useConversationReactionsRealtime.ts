import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

    const channel = supabase
      .channel(`conv-reactions:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'message_reactions' },
        (payload) => {
          const newRow = payload.new as { message_id?: string } | null;
          const oldRow = payload.old as { message_id?: string } | null;
          const messageId = newRow?.message_id ?? oldRow?.message_id;
          if (!messageId) return;
          if (!idsRef.current.has(messageId)) return;
          queryClient.invalidateQueries({ queryKey: queryKeys.messageReactions.message(messageId) });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR')
          log.error('Falha ao assinar canal de reações', { conversationId });
      });

    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);
}
