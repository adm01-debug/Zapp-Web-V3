import { useState, useEffect } from 'react';
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

export function useSecurityAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchLogs = async () => {
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

      if (!mounted) return;
      if (error) {
        log.error('Error fetching audit logs', error);
      } else {
        setLogs(data as AuditLog[]);
      }
      setLoading(false);
    };

    fetchLogs();

    const channel = supabase
      .channel('security_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'security_audit_logs' },
        (payload) => {
          setLogs((prev) => [payload.new as AuditLog, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { logs, loading };
}
