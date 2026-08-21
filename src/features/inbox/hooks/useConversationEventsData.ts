/**
 * useConversationEventsData — query canônica de `conversation_events` por contato.
 *
 * UNIFICAÇÃO (BUG-2026-08-06): 2 componentes consultavam a mesma tabela com
 * chaves diferentes:
 *   - `ConversationTimeline` (select grande, queryKey adminOps.conversationTimeline)
 *   - `useContactDetailStats` (select=id & event_type=eq.close, queryKey próprio)
 *
 * Agora ambos usam ESTE objeto de query (mesmo queryKey + mesmo select) →
 * o React Query deduplica: 1 GET por contato, e o stats conta os `close`
 * diretamente do cache da timeline.
 *
 * staleTime 30s: sem refetch ao reabrir conversa / re-render.
 */
import { queryOptions } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { queryKeys } from '@/services/api/queryKeys';
import { isValidUUID } from '@/utils/uuid';

export interface ConversationEventLite {
  id: string;
  event_type: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_queue_id: string | null;
  to_queue_id: string | null;
  metadata: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
  from_agent?: { name: string } | null;
  to_agent?: { name: string } | null;
  from_queue?: { name: string } | null;
  to_queue?: { name: string } | null;
}

export const conversationEventsQueryOptions = (
  contactId: string | null | undefined
) =>
  queryOptions({
    queryKey: queryKeys.adminOps.conversationTimeline(contactId ?? undefined),
    enabled: !!contactId && isValidUUID(contactId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<ConversationEventLite[]> => {
      if (!contactId) return [];
      const { data, error } = await safeClient.from<ConversationEventLite>(
        'conversation_events',
        (q) =>
          q
            .select(
              `id, event_type, from_agent_id, to_agent_id,
              from_queue_id, to_queue_id, metadata, performed_by, created_at,
              from_agent:profiles!conversation_events_from_agent_id_fkey(name),
              to_agent:profiles!conversation_events_to_agent_id_fkey(name),
              from_queue:queues!conversation_events_from_queue_id_fkey(name),
              to_queue:queues!conversation_events_to_queue_id_fkey(name)`
            )
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            // 200 (era 50): a timeline renderiza o que recebe, e o stats de
            // "Conversas" conta os `close` deste mesmo cache — 50 subestimaria
            // contatos com muitas transferências/atribuições.
            .limit(200)
            .abortSignal(signal),
        { signal }
      );
      if (error) throw error;
      return Array.isArray(data) ? (data as ConversationEventLite[]) : [];
    },
  });
