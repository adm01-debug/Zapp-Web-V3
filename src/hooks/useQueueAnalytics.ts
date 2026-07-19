import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DateRange {
  from: Date;
  to: Date;
}

interface DailyData {
  day: string;
  mensagens: number;
  resolvidos: number;
  novos: number;
}

interface HourlyData {
  hora: string;
  atendimentos: number;
}

interface StatusData {
  name: string;
  value: number;
  color: string;
}

interface AgentPerformance {
  agentId: string;
  agentName: string;
  contactsHandled: number;
  messagesCount: number;
}

function buildDayPlaceholders(from: Date, to: Date): DailyData[] {
  const days: DailyData[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (cursor <= end) {
    days.push({ day: cursor.toISOString().split('T')[0], mensagens: 0, resolvidos: 0, novos: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function useQueueAnalytics(queueId: string, dateRange: DateRange) {
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnalytics() {
      setLoading(true);
      const days = buildDayPlaceholders(dateRange.from, dateRange.to);

      try {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, assigned_to, created_at')
          .eq('queue_id', queueId);

        const contactList: Array<{ id: string; assigned_to: string | null; created_at: string }> =
          contacts || [];
        const contactIds = contactList.map((c) => c.id);

        contactList.forEach((c) => {
          const dayKey = c.created_at?.split('T')[0];
          const entry = days.find((d) => d.day === dayKey);
          if (entry) {
            entry.novos++;
            if (c.assigned_to !== null) entry.resolvidos++;
          }
        });

        let messages: Array<{ id: string; contact_id: string; sender: string; created_at: string }> = [];
        if (contactIds.length > 0) {
          const { data: msgData } = await supabase
            .from('messages')
            .select('id, contact_id, sender, created_at')
            .in('contact_id', contactIds)
            .gte('created_at', dateRange.from.toISOString())
            .lte('created_at', dateRange.to.toISOString());
          messages = msgData || [];
        }

        messages.forEach((m) => {
          const dayKey = m.created_at?.split('T')[0];
          const entry = days.find((d) => d.day === dayKey);
          if (entry) entry.mensagens++;
        });

        const hourlyMap: Record<number, number> = {};
        messages.forEach((m) => {
          const h = new Date(m.created_at).getHours();
          hourlyMap[h] = (hourlyMap[h] || 0) + 1;
        });
        const hourly: HourlyData[] = Array.from({ length: 24 }, (_, h) => ({
          hora: `${String(h).padStart(2, '0')}:00`,
          atendimentos: hourlyMap[h] || 0,
        }));

        const agentIds = [
          ...new Set(
            contactList
              .map((c) => c.assigned_to)
              .filter(Boolean) as string[]
          ),
        ];
        let profiles: Array<{ id: string; name: string }> = [];
        if (agentIds.length > 0) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', agentIds);
          profiles = profileData || [];
        }

        const agentMap: Record<
          string,
          { agentId: string; agentName: string; contactsHandled: number; messagesCount: number }
        > = {};
        contactList.forEach((c) => {
          if (c.assigned_to) {
            if (!agentMap[c.assigned_to]) {
              const profile = profiles.find((p) => p.id === c.assigned_to);
              agentMap[c.assigned_to] = {
                agentId: c.assigned_to,
                agentName: profile?.name || 'Unknown',
                contactsHandled: 0,
                messagesCount: 0,
              };
            }
            agentMap[c.assigned_to].contactsHandled++;
          }
        });
        messages.forEach((m) => {
          const contact = contactList.find((c) => c.id === m.contact_id);
          if (contact?.assigned_to && agentMap[contact.assigned_to]) {
            agentMap[contact.assigned_to].messagesCount++;
          }
        });

        const resolved = contactList.filter((c) => c.assigned_to !== null).length;
        const pending = contactList.length - resolved;

        if (!cancelled) {
          setDailyData(days);
          setHourlyData(hourly);
          setStatusData([
            { name: 'Resolvidas', value: resolved, color: 'hsl(var(--success))' },
            { name: 'Pendentes', value: pending, color: 'hsl(var(--warning))' },
          ]);
          setAgentPerformance(Object.values(agentMap));
        }
      } catch {
        if (!cancelled) {
          setDailyData(days);
          setHourlyData([]);
          setStatusData([
            { name: 'Resolvidas', value: 0, color: 'hsl(var(--success))' },
            { name: 'Pendentes', value: 0, color: 'hsl(var(--warning))' },
          ]);
          setAgentPerformance([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAnalytics();
    return () => { cancelled = true; };
  }, [queueId, dateRange.from, dateRange.to]);

  return { loading, dailyData, hourlyData, statusData, agentPerformance };
}
