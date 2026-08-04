import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('AdminACLAlerts');

/** Alerta de ACL gerado pela auditoria de permissões (zapp.security_acl_alerts). */
export interface ACLAlert {
  id: number;
  alert_type: string;
  severity: string;
  role_name: string;
  object_name: string;
  privilege: string;
  details: unknown;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

const ACL_ALERTS_KEY = ['security-acl-alerts'] as const;

/**
 * SEGURANCA-09: consome zapp.security_acl_alerts (cron gera ~2189 alertas;
 * zero telas consumiam). Segue o padrão de useSecurityAuditLogs.
 */
export function useACLAlerts() {
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading: loading } = useQuery({
    queryKey: ACL_ALERTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_acl_alerts')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(100);

      if (error) {
        log.error('Error fetching ACL alerts', error);
        return [] as ACLAlert[];
      }
      return data as ACLAlert[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('security_acl_alerts_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'security_acl_alerts' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ACL_ALERTS_KEY });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'zapp', table: 'security_acl_alerts' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ACL_ALERTS_KEY });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { alerts, loading };
}
