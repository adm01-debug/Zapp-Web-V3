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

  // R6 regression review: a timeline tem cap de 200 eventos — contar closes só
  // no cache subestimaria contatos com muitas transferências/atribuições.
  // Contagem exata dedicada (SELECT id, sem joins — payload pequeno).
  const { data: closeIds, isLoading: closeCountLoading } = useQuery<string[]>({
    queryKey: ['contact-detail-stats-closes', contactId],
    enabled: !!contactId && isValidUUID(contactId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await safeClient.from<{ id: string }>('conversation_events', (q) =>
        q.select('id').eq('contact_id', contactId).eq('event_type', 'close')
      );
      return (data ?? []).map((r) => r.id);
    },
  });

  const isLoading =
    messagesQuery.isLoading || eventsQuery.isLoading || csatLoading || closeCountLoading;

  const stats = useMemo<ContactDetailStats | null>(() => {
    if (isLoading) return null;

    // Cache compartilhado vem em ordem DESC (1000 mais recentes) — o cálculo
    // de tempo de resposta precisa de ordem cronológica (R7).
    const messages = [...(messagesQuery.data ?? [])].reverse();
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

    // "Conversas" = eventos de fechamento — contagem exata dedicada (R6), sem
    // depender do cap de 200 da timeline.
    const totalConversations = closeIds?.length ?? 0;

    const ratings = csatData ?? [];
    const csatCount = ratings.length;
    const csatAverage =
      csatCount > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / csatCount : null;

    return { totalMessages, avgResponseTimeMinutes, totalConversations, csatAverage, csatCount };
  }, [isLoading, messagesQuery.data, csatData, closeIds]);

  return { stats, isLoading };
}
