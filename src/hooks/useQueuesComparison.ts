import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DateRange {
  from: Date;
  to: Date;
}

interface QueuePerformance {
  id: string;
  name: string;
  color: string;
  totalContacts: number;
  assignedContacts: number;
  waitingContacts: number;
  agentsCount: number;
  totalMessages: number;
  avgMessagesPerContact: number;
  assignmentRate: number;
}

/** Re-exported module members. */
export type { DateRange };

/** Compares active queues by contacts, assignment rate, agent count, and message volume within the given date range. */
export function useQueuesComparison(dateRange: DateRange) {
  const fromIso = dateRange.from.toISOString();
  const toIso = dateRange.to.toISOString();

  const { data: queuesPerformance = [], isLoading: loading } = useQuery({
    queryKey: ['queues-comparison', fromIso, toIso],
    queryFn: async (): Promise<QueuePerformance[]> => {
      const { data: queues, error: qErr } = await supabase
        .from('queues')
        .select('id, name, color')
        .eq('is_active', true);

      if (qErr) throw qErr;

      const queueList: Array<{ id: string; name: string; color: string }> = queues || [];

      if (queueList.length === 0) return [];

      const [contactsRes, membersRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, queue_id, assigned_to')
          .not('queue_id', 'is', null)
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
        supabase
          .from('queue_members')
          .select('queue_id, profile_id')
          .eq('is_active', true),
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (membersRes.error) throw membersRes.error;

      const contactList = (contactsRes.data || []) as Array<{
        id: string;
        queue_id: string;
        assigned_to: string | null;
      }>;
      const memberList = (membersRes.data || []) as Array<{ queue_id: string; profile_id: string }>;

      const contactIds = contactList.map((c) => c.id);

      let messageList: Array<{ id: string; contact_id: string }> = [];
      if (contactIds.length > 0) {
        const { data: msgs, error: msgsErr } = await supabase
          .from('evolution_messages')
          .select('id, contact_id')
          .in('contact_id', contactIds)
          .gte('created_at', fromIso)
          .lte('created_at', toIso);
        if (msgsErr) throw msgsErr;
        messageList = msgs || [];
      }

      return queueList.map((q) => {
        const qContacts = contactList.filter((c) => c.queue_id === q.id);
        const totalContacts = qContacts.length;
        const assignedContacts = qContacts.filter((c) => c.assigned_to !== null).length;
        const waitingContacts = totalContacts - assignedContacts;
        const agentsCount = memberList.filter((m) => m.queue_id === q.id).length;
        const qContactIds = qContacts.map((c) => c.id);
        const totalMessages = messageList.filter((m) => qContactIds.includes(m.contact_id)).length;
        const avgMessagesPerContact = totalContacts > 0 ? totalMessages / totalContacts : 0;
        const assignmentRate = totalContacts > 0 ? (assignedContacts / totalContacts) * 100 : 0;
        return {
          id: q.id,
          name: q.name,
          color: q.color,
          totalContacts,
          assignedContacts,
          waitingContacts,
          agentsCount,
          totalMessages,
          avgMessagesPerContact,
          assignmentRate,
        };
      });
    },
    staleTime: 30_000,
  });

  return { loading, queuesPerformance };
}
