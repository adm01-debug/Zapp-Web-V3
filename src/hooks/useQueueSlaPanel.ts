import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';

export type SlaStatusFilter = 'on_track' | 'at_risk' | 'breached' | null;

export interface QueueSlaRow {
  queue_id: string;
  queue_name: string;
  color: string;
  sla_priority: 'low' | 'medium' | 'high' | 'critical';
  routing_weight: number;
  auto_rebalance_enabled: boolean;
  max_wait_time_minutes: number;
  active_agents: number;
  waiting_count: number;
  in_progress_count: number;
  breached_count: number;
  at_risk_count: number;
  oldest_wait_minutes: number;
  last_routed_at: string | null;
}

export interface QueueSlaFilters {
  skill_name: string | null;
  channel_type: string | null;
  sla_status: SlaStatusFilter;
}

export function useQueueSlaPanel(filters: QueueSlaFilters) {
  const [rows, setRows] = useState<QueueSlaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchRows = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await safeClient.rpc<QueueSlaRow[]>('rpc_queue_sla_panel', {
        p_skill_name: filters.skill_name,
        p_channel_type: filters.channel_type,
        p_sla_status: filters.sla_status,
      });
      if (!mountedRef.current) return;
      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setRows(data ?? []);
      }
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [filters.skill_name, filters.channel_type, filters.sla_status]);

  useEffect(() => {
    fetchRows();
    const id = setInterval(fetchRows, 30_000);
    return () => clearInterval(id);
  }, [fetchRows]);

  const updateQueueConfig = async (
    queueId: string,
    patch: Partial<Pick<QueueSlaRow, 'sla_priority' | 'routing_weight' | 'auto_rebalance_enabled'>>
  ) => {
    const { error } = await safeClient.from('queues', (q) => q.update(patch).eq('id', queueId));
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return false;
    }
    setRows((prev) => prev.map((r) => (r.queue_id === queueId ? { ...r, ...patch } : r)));
    toast({ title: 'Fila atualizada' });
    return true;
  };

  const triggerRebalance = async (limit = 50) => {
    const { data, error } = await supabase.functions.invoke('queue-rebalance', {
      body: { limit, source: 'panel' },
    });
    if (error) {
      toast({
        title: 'Falha no redistribuidor',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
    toast({
      title: 'Redistribuição concluída',
      description: `${data?.assigned ?? 0} atribuídos, ${data?.skipped ?? 0} sem agente disponível.`,
    });
    fetchRows();
    return data as { processed: number; assigned: number; skipped: number; errors: number };
  };

  return { rows, loading, error, refetch: fetchRows, updateQueueConfig, triggerRebalance };
}
