import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { isValidUUID } from '@/utils/uuid';
import { useConversationMessagesData } from './useConversationMessagesData';
import { conversationEventsQueryOptions } from './useConversationEventsData';

export interface ContactDetailStats {
  totalMessages: number;
  avgResponseTimeMinutes: number | null;
  totalConversations: number;
  csatAverage: number | null;
  csatCount: number;
}

export interface UseContactDetailStatsReturn {
  stats: ContactDetailStats | null;
  isLoading: boolean;
}

/**
 * Stats do contato derivados do CACHE COMPARTILHADO do painel de conversa
 * (BUG-2026-08-06): `messages` vem de useConversationMessagesData e
 * `conversation_events` da query canônica da timeline (mesmo queryKey) —
 * antes eram 2 fetches próprios duplicando as tabelas por contato.
 * Só o CSAT continua sendo query própria (dado exclusivo).
 */
export function useContactDetailStats(contactId: string): UseContactDetailStatsReturn {
  const messagesQuery = useConversationMessagesData(contactId);
  const eventsQuery = useQuery(conversationEventsQueryOptions(contactId));

  const { data: csatData, isLoading: csatLoading } = useQuery<{ rating: number }[]>({
    queryKey: ['contact-detail-stats-csat', contactId],
    enabled: !!contactId && isValidUUID(contactId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await safeClient.from<{ rating: number }>('csat_surveys', (q) =>
        q.select('rating').eq('contact_id', contactId)
      );
      return data ?? [];
    },
  });

  const isLoading =
    messagesQuery.isLoading || eventsQuery.isLoading || csatLoading;

  const stats = useMemo<ContactDetailStats | null>(() => {
    if (isLoading) return null;

    const messages = messagesQuery.data ?? [];
    const totalMessages = messages.length;

    // Average first-response time: time from last contact message to first subsequent agent reply
    let totalResponseMs = 0;
    let responseCount = 0;
    let lastContactAt: number | null = null;
    for (const msg of messages) {
      if (msg.sender === 'contact') {
        lastContactAt = new Date(msg.created_at).getTime();
      } else if (msg.sender === 'agent' && lastContactAt !== null) {
        totalResponseMs += new Date(msg.created_at).getTime() - lastContactAt;
        responseCount++;
        lastContactAt = null;
      }
    }
    const avgResponseTimeMinutes =
      responseCount > 0 ? Math.round(totalResponseMs / responseCount / 60000) : null;

    // "Conversas" = eventos de fechamento — lidos do cache da timeline
    // (conversation_events), sem fetch próprio.
    const totalConversations = (eventsQuery.data ?? []).filter(
      (e) => e.event_type === 'close'
    ).length;

    const ratings = csatData ?? [];
    const csatCount = ratings.length;
    const csatAverage =
      csatCount > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / csatCount : null;

    return { totalMessages, avgResponseTimeMinutes, totalConversations, csatAverage, csatCount };
  }, [isLoading, messagesQuery.data, eventsQuery.data, csatData]);

  return { stats, isLoading };
}
