import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useContactDetailStats(contactId: string): UseContactDetailStatsReturn {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['contact-detail-stats', contactId],
    // Skip when contactId is a WhatsApp JID (e.g. 5511@s.whatsapp.net) — those are
    // external-DB contacts whose UUID columns can't accept JID strings.
    enabled: !!contactId && UUID_RE.test(contactId),
    staleTime: 60_000,
    queryFn: async (): Promise<ContactDetailStats> => {
      const [msgsResult, eventsResult, csatResult] = await Promise.all([
        safeClient.from<{ sender: string; created_at: string }>('messages', (q) =>
          q
            .select('sender, created_at')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: true })
            .limit(500)
        ),
        safeClient.from<{ id: string }>('conversation_events', (q) =>
          q.select('id').eq('contact_id', contactId).eq('event_type', 'close')
        ),
        safeClient.from<{ rating: number }>('csat_surveys', (q) =>
          q.select('rating').eq('contact_id', contactId)
        ),
      ]);

      const messages = msgsResult.data ?? [];
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

      const totalConversations = eventsResult.data?.length ?? 0;

      const ratings = csatResult.data ?? [];
      const csatCount = ratings.length;
      const csatAverage =
        csatCount > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / csatCount : null;

      return { totalMessages, avgResponseTimeMinutes, totalConversations, csatAverage, csatCount };
    },
  });

  return { stats: stats ?? null, isLoading };
}
