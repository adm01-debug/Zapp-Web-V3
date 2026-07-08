// @ts-nocheck — strict-mode retrofit pendente (ver docs/STRICT_MODE_BACKLOG.md)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SLAAlertSeverity = 'risk' | 'violated';

export interface SLAAlertHistoryEntry {
  id: string;
  threadId: string;
  contactName: string;
  contactPhone: string | null;
  status: SLAAlertSeverity;
  isResolved: boolean;
  resolvedAt: string | null;
  alertTime: string;
  createdAt: string;
  metadata: any;
}

const PAGE_SIZE = 100;

async function fetchHistory(): Promise<SLAAlertHistoryEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any) /* TS2589: schema too deep for sla_history */
    .from('sla_history')
    .select(`
      id,
      thread_id,
      status,
      is_resolved,
      resolved_at,
      alert_time,
      created_at,
      metadata,
      conversation_threads(
        remote_jid,
        contacts:external_contact_id(name, phone)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const thread = row.conversation_threads;
    const contact = thread?.contacts;
    
    return {
      id: row.id,
      threadId: row.thread_id,
      contactName: contact?.name ?? thread?.remote_jid ?? 'Conversa desconhecida',
      contactPhone: contact?.phone ?? null,
      status: row.status as SLAAlertSeverity,
      isResolved: row.is_resolved,
      resolvedAt: row.resolved_at,
      alertTime: row.alert_time,
      createdAt: row.created_at,
      metadata: row.metadata,
    };
  });
}

export function useSLAAlertHistory() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['sla-alert-history'],
    queryFn: fetchHistory,
    staleTime: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sla_history')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-alert-history'] });
    },
  });

  return {
    ...query,
    resolveAlert: resolveMutation.mutate,
    isResolving: resolveMutation.isPending,
  };
}