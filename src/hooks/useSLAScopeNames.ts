import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from '@/features/sla';

export function useSLAScopeNames(
  scope: SLARuleScope,
  contactIds: string[],
  queueIds: string[],
  agentIds: string[],
) {
  const { data: contactNames = {} } = useQuery({
    queryKey: queryKeys.sla.contactNames(contactIds),
    queryFn: async () => {
      if (contactIds.length === 0) return {};
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .in('id', contactIds);
      const map: Record<string, string> = {};
      (data || []).forEach((c) => {
        map[c.id] = `${c.name} (${c.phone})`;
      });
      return map;
    },
    enabled: scope === 'contact' && contactIds.length > 0,
  });

  const { data: queueNames = {} } = useQuery({
    queryKey: queryKeys.sla.queueNames(queueIds),
    queryFn: async () => {
      if (queueIds.length === 0) return {};
      const { data } = await supabase.from('queues').select('id, name').in('id', queueIds);
      const map: Record<string, string> = {};
      (data || []).forEach((q) => {
        map[q.id] = q.name;
      });
      return map;
    },
    enabled: scope === 'queue' && queueIds.length > 0,
  });

  const { data: agentNames = {} } = useQuery({
    queryKey: queryKeys.sla.agentNames(agentIds),
    queryFn: async () => {
      if (agentIds.length === 0) return {};
      const { data } = await supabase.from('profiles').select('id, name').in('id', agentIds);
      const map: Record<string, string> = {};
      (data || []).forEach((a) => {
        map[a.id] = a.name;
      });
      return map;
    },
    enabled: scope === 'agent' && agentIds.length > 0,
  });

  return { contactNames, queueNames, agentNames };
}
