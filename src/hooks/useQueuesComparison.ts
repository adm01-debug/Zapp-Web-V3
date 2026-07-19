import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DateRange {
  from: Date;
  to: Date;
}

interface QueuePerformance {
  queueId: string;
  queueName: string;
  color: string;
  totalContacts: number;
  assignedContacts: number;
  agentCount: number;
  messageCount: number;
  assignmentRate: number;
}

export type { DateRange };

export function useQueuesComparison(dateRange: DateRange) {
  const [loading, setLoading] = useState(true);
  const [queuesPerformance, setQueuesPerformance] = useState<QueuePerformance[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchComparison() {
      setLoading(true);
      try {
        const { data: queues, error: qErr } = await supabase
          .from('queues')
          .select('id, name, color')
          .eq('is_active', true);

        if (qErr) throw qErr;

        const queueList: Array<{ id: string; name: string; color: string }> = queues || [];

        if (queueList.length === 0) {
          if (!cancelled) {
            setQueuesPerformance([]);
            setLoading(false);
          }
          return;
        }

        const fromIso = dateRange.from.toISOString();
        const toIso = dateRange.to.toISOString();

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

        const contactList: Array<{ id: string; queue_id: string; assigned_to: string | null }> =
          contactsRes.data || [];
        const memberList: Array<{ queue_id: string; profile_id: string }> = membersRes.data || [];

        const contactIds = contactList.map((c) => c.id);

        let messageList: Array<{ id: string; contact_id: string }> = [];
        if (contactIds.length > 0) {
          const { data: msgs, error: msgsErr } = await supabase
            .from('messages')
            .select('id, contact_id')
            .in('contact_id', contactIds)
            .gte('created_at', fromIso)
            .lte('created_at', toIso);
          if (msgsErr) throw msgsErr;
          messageList = msgs || [];
        }

        const performance: QueuePerformance[] = queueList.map((q) => {
          const qContacts = contactList.filter((c) => c.queue_id === q.id);
          const totalContacts = qContacts.length;
          const assignedContacts = qContacts.filter((c) => c.assigned_to !== null).length;
          const agentCount = memberList.filter((m) => m.queue_id === q.id).length;
          const qContactIds = qContacts.map((c) => c.id);
          const messageCount = messageList.filter((m) => qContactIds.includes(m.contact_id)).length;
          const assignmentRate = totalContacts > 0 ? (assignedContacts / totalContacts) * 100 : 0;
          return {
            queueId: q.id,
            queueName: q.name,
            color: q.color,
            totalContacts,
            assignedContacts,
            agentCount,
            messageCount,
            assignmentRate,
          };
        });

        if (!cancelled) setQueuesPerformance(performance);
      } catch {
        if (!cancelled) setQueuesPerformance([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchComparison();
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to]);

  return { loading, queuesPerformance };
}
