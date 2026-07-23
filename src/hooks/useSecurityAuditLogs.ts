import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('AdminSecurityLogsPage');

export interface AuditLog {
  id: string;
  user_id: string;
  event_type: string;
  resource: string;
  action: string;
  status: string;
  details: unknown;
  created_at: string;
  profiles?: {
    name: string;
    email: string;
  };
}

const SECURITY_LOGS_KEY = ['security-audit-logs'] as const;

export function useSecurityAuditLogs() {
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading: loading } = useQuery({
    queryKey: SECURITY_LOGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_audit_logs')
        .select(
          `
          *,
          profiles:user_id (
            name,
            email
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        log.error('Error fetching audit logs', error);
        return [] as AuditLog[];
      }
      return data as AuditLog[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('security_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'security_audit_logs' },
        () => {
          void queryClient.invalidateQueries({ queryKey: SECURITY_LOGS_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { logs, loading };
}
