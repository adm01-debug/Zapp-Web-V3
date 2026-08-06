import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from '@/features/sla';
import { isValidUUID } from '@/utils/uuid';
import { QUERY_STALE_TIMES, QUERY_GC_TIMES } from '@/lib/queryStaleTimes';

export function useSLAScopeNames(
  scope: SLARuleScope,
  contactIds: string[],
  queueIds: string[],
  agentIds: string[]
) {
  const { data: contactNames = {} } = useQuery({
    queryKey: queryKeys.sla.contactNames(contactIds),
    queryFn: async () => {
      const validIds = contactIds.filter(isValidUUID);
      if (validIds.length === 0) return {};
      const { data } = await supabase.from('contacts').select('id, name, phone').in('id', validIds);
      const map: Record<string, string> = {};
      (data || []).forEach((c) => {
        if (!c.id) return;
        map[c.id] = `${c.name} (${c.phone})`;
      });
      return map;
    },
    enabled: scope === 'contact' && contactIds.length > 0,
    staleTime: QUERY_STALE_TIMES.slaRules,
    gcTime: QUERY_GC_TIMES.slaRules,
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
    staleTime: QUERY_STALE_TIMES.queues,
    gcTime: QUERY_GC_TIMES.queues,
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
    staleTime: QUERY_STALE_TIMES.profiles,
    gcTime: QUERY_GC_TIMES.profiles,
  });

  return { contactNames, queueNames, agentNames };
}
