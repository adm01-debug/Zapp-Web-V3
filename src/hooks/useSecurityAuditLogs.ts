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
const SECURITY_DENIED_24H_KEY = ['security-audit-logs-denied-24h'] as const;
const SECURITY_PERMISSION_CHANGES_KEY = ['security-audit-logs-permission-changes-24h'] as const;
const SECURITY_ADMIN_LOGINS_KEY = ['security-audit-logs-admin-logins-7d'] as const;
const SECURITY_RLS_FAILURES_KEY = ['security-audit-logs-rls-failures-24h'] as const;

/** Returns an ISO timestamp for `hours` hours in the past from now. */
function cutoff(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** Hook that fetches security audit logs and aggregated metrics for the admin security panel. */
export function useSecurityAuditLogs() {
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading: loading } = useQuery({
    queryKey: SECURITY_LOGS_KEY,
    queryFn: async () => {
      const since24h = cutoff(24);
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
        .gte('created_at', since24h)
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

  const { data: deniedCount24h = 0 } = useQuery({
    queryKey: SECURITY_DENIED_24H_KEY,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('security_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'denied')
        .gte('created_at', cutoff(24));

      if (error) {
        log.error('Error fetching denied count', error);
        return 0;
      }
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: permissionChanges24h = 0 } = useQuery({
    queryKey: SECURITY_PERMISSION_CHANGES_KEY,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('security_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'permission_change')
        .gte('created_at', cutoff(24));

      if (error) {
        log.error('Error fetching permission changes count', error);
        return 0;
      }
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: adminLogins7d = 0 } = useQuery({
    queryKey: SECURITY_ADMIN_LOGINS_KEY,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('security_audit_logs')
        .select('*', { count: 'exact', head: true })
        .in('event_type', ['admin_login', 'login'])
        .eq('status', 'allowed')
        .gte('created_at', cutoff(24 * 7));

      if (error) {
        log.error('Error fetching admin logins count', error);
        return 0;
      }
      return count ?? 0;
    },
    staleTime: 300_000,
    refetchInterval: 300_000,
  });

  const { data: rlsFailures24h = 0 } = useQuery({
    queryKey: SECURITY_RLS_FAILURES_KEY,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('security_audit_logs')
        .select('*', { count: 'exact', head: true })
        .in('event_type', ['rls_denied', 'rls_policy_violation'])
        .gte('created_at', cutoff(24));

      if (error) {
        log.error('Error fetching RLS failures count', error);
        return 0;
      }
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('security_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'security_audit_logs' },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: SECURITY_LOGS_KEY });
          const newLog = payload.new as AuditLog;
          if (newLog?.status === 'denied') {
            void queryClient.invalidateQueries({ queryKey: SECURITY_DENIED_24H_KEY });
            void queryClient.invalidateQueries({ queryKey: SECURITY_RLS_FAILURES_KEY });
          }
          if (newLog?.event_type === 'permission_change') {
            void queryClient.invalidateQueries({ queryKey: SECURITY_PERMISSION_CHANGES_KEY });
          }
          if (['admin_login', 'login'].includes(newLog?.event_type)) {
            void queryClient.invalidateQueries({ queryKey: SECURITY_ADMIN_LOGINS_KEY });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { logs, loading, deniedCount24h, permissionChanges24h, adminLogins7d, rlsFailures24h };
}
