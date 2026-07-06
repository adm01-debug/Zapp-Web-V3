/**
 * useChannelRoutingRules — Wave 3 tier-2 (2026-07-06)
 * Camada de dados extraída de ChannelRoutingRules. Query keys e semântica
 * preservadas; resets de formulário via onSuccess no call-site.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export interface NewRoutingRule { channel_type: string; queue_id: string; priority: number }

export interface RoutingRule {
  id: string;
  channel_type: string;
  channel_connection_id: string | null;
  queue_id: string | null;
  priority: number | null;
  is_active: boolean | null;
  conditions: Record<string, unknown> | null;
  created_at: string;
  queue?: { name: string } | null;
  channel_connection?: { name: string } | null;
}

export function useChannelRoutingRules() {
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['channel-routing-rules'],
    queryFn: async () => {
      const { data, error } = await (supabase as any) /* TS2589: schema 678 */
        .from('channel_routing_rules')
        .select('*, queue:queues(name), channel_connection:channel_connections_safe(name)')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data || []) as RoutingRule[];
    },
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues-for-routing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('channel_routing_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('channel_routing_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
      toast.success('Regra removida');
    },
  });

  const createRule = useMutation({
    mutationFn: async (rule: NewRoutingRule) => {
      const { error } = await supabase
        .from('channel_routing_rules')
        .insert({
          channel_type: rule.channel_type as Database["public"]["Enums"]["channel_type"],
          queue_id: rule.queue_id || null,
          priority: rule.priority,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
      toast.success('Regra criada');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { rules, isLoading, queues, toggleRule, deleteRule, createRule };
}
