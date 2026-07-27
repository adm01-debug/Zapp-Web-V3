import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from '@/features/sla';
import { isValidUUID } from '@/utils/uuid';

export function useSLAScopeNames(
  scope: SLARuleScope,
  contactIds: string[],
  queueIds: string[],
  agentIds: string[]
) {
  const BATCH = 500;

  const { data: contactNames = {} } = useQuery({
    queryKey: queryKeys.sla.contactNames(contactIds),
    queryFn: async () => {
      const validIds = contactIds.filter(isValidUUID);
      if (validIds.length === 0) return {};
      const all: { id: string; name: string; phone: string }[] = [];
      for (let i = 0; i < validIds.length; i += BATCH) {
        const { data } = await supabase
          .from('contacts')
          .select('id, name, phone')
          .in('id', validIds.slice(i, i + BATCH));
        all.push(...(data || []));
      }
      const map: Record<string, string> = {};
      all.forEach((c) => { map[c.id] = `${c.name} (${c.phone})`; });
      return map;
    },
    enabled: scope === 'contact' && contactIds.length > 0,
  });

  const { data: queueNames = {} } = useQuery({
    queryKey: queryKeys.sla.queueNames(queueIds),
    queryFn: async () => {
      if (queueIds.length === 0) return {};
      const all: { id: string; name: string }[] = [];
      for (let i = 0; i < queueIds.length; i += BATCH) {
        const { data } = await supabase
          .from('queues')
          .select('id, name')
          .in('id', queueIds.slice(i, i + BATCH));
        all.push(...(data || []));
      }
      const map: Record<string, string> = {};
      all.forEach((q) => { map[q.id] = q.name; });
      return map;
    },
    enabled: scope === 'queue' && queueIds.length > 0,
  });

  const { data: agentNames = {} } = useQuery({
    queryKey: queryKeys.sla.agentNames(agentIds),
    queryFn: async () => {
      if (agentIds.length === 0) return {};
      const all: { id: string; name: string }[] = [];
      for (let i = 0; i < agentIds.length; i += BATCH) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', agentIds.slice(i, i + BATCH));
        all.push(...(data || []));
      }
      const map: Record<string, string> = {};
      all.forEach((a) => { map[a.id] = a.name; });
      return map;
    },
    enabled: scope === 'agent' && agentIds.length > 0,
  });

  return { contactNames, queueNames, agentNames };
}
