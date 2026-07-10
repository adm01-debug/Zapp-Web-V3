/**
 * useSLAScopeOptions — Wave 3 tier-2 (2026-07-06)
 * Queries de opções de escopo extraídas de SLARuleFormDialog (query keys e
 * enabled-conditions preservados byte-a-byte).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from '@/features/sla';

export function useSLAScopeOptions(open: boolean, scope: SLARuleScope, contactSearch: string) {
  const { data: companies = [] } = useQuery({
    queryKey: ['sla-scope-companies'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('company').not('company', 'is', null);
      return [...new Set((data || []).map(d => d.company).filter(Boolean))] as string[];
    },
    enabled: open && scope === 'company',
  });

  const { data: jobTitles = [] } = useQuery({
    queryKey: ['sla-scope-jobtitles'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('job_title').not('job_title', 'is', null);
      return [...new Set((data || []).map(d => d.job_title).filter(Boolean))] as string[];
    },
    enabled: open && scope === 'job_title',
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['sla-scope-queues'],
    queryFn: async () => {
      const { data } = await supabase.from('queues').select('id, name');
      return data || [];
    },
    enabled: open && scope === 'queue',
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['sla-scope-agents'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name').eq('is_active', true);
      return data || [];
    },
    enabled: open && scope === 'agent',
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['sla-scope-contacts', contactSearch],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, name, phone')
        .or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`)
        .limit(20);
      return data || [];
    },
    enabled: open && scope === 'contact' && contactSearch.length >= 2,
  });

  return { companies, jobTitles, queues, agents, contacts };
}
