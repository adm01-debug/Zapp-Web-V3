import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  details: unknown;
};

const OPS_ENTITY_TYPES = [
  'service_channel',
  'queue',
  'channel_queue',
  'sticky_assignment',
  'message_reaction',
] as const;

interface UseOpsAuditLogsOptions {
  entity: string;
  search: string;
}

export function useOpsAuditLogs({ entity, search }: UseOpsAuditLogsOptions) {
  const { data: rows = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['ops-audit-logs', entity, search] as const,
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('id,user_id,action,entity_type,entity_id,created_at,details')
        .order('created_at', { ascending: false })
        .limit(100);

      if (entity === 'all') {
        q = q.in('entity_type', [...OPS_ENTITY_TYPES]);
      } else {
        q = q.eq('entity_type', entity);
      }
      if (search.trim()) q = q.ilike('action', `%${search.trim()}%`);

      const { data, error } = await q;
      if (error) {
        toast.error('Erro ao carregar audit: ' + error.message);
        return [] as AuditRow[];
      }
      return (data as AuditRow[]) ?? []; // ignore-audit: narrows Supabase query result to local interface
    },
    staleTime: 30_000,
  });

  return { rows, loading, load: refetch };
}
