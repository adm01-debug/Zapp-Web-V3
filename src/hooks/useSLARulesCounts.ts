import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import type { SLARuleScope } from '@/features/sla';

export interface SLARuleCountRow {
  contact_id: string | null;
  company: string | null;
  job_title: string | null;
  contact_type: string | null;
  queue_id: string | null;
  agent_id: string | null;
}

export function useSLARulesCounts() {
  return useQuery<SLARuleCountRow[]>({
    queryKey: queryKeys.sla.rulesCounts(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_rules')
        .select('contact_id, company, job_title, contact_type, queue_id, agent_id');
      if (error) throw error;
      return (data ?? []) as SLARuleCountRow[];
    },
  });
}

export type { SLARuleScope };
