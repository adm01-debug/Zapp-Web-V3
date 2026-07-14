// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import type { Database } from '@/integrations/supabase/schema';
import { toast as toastSonner } from 'sonner';
import { toast as toastHook } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export type ChannelType = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'webchat' | 'email';

export interface OmnichannelChannel {
  id: string;
  name: string;
  channel_type: ChannelType;
  status: string;
}

export interface NewRoutingRule {
  channel_type: string;
  queue_id: string;
  priority: number;
}

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

export interface UseOmnichannelChannelsParams {
  // no params needed
}

export interface UseOmnichannelChannelsResult {
  channels: OmnichannelChannel[];
  isLoading: boolean;
  addChannel: ReturnType<typeof useMutation>;
  deleteChannel: ReturnType<typeof useMutation>;
}

export interface UseChannelRoutingRulesParams {
  // no params needed
}

export interface UseChannelRoutingRulesResult {
  rules: RoutingRule[];
  isLoading: boolean;
  queues: Array<{ id: string; name: string }>;
  toggleRule: ReturnType<typeof useMutation>;
  deleteRule: ReturnType<typeof useMutation>;
  createRule: ReturnType<typeof useMutation>;
}

// ═══════════════════════════════════════════════════════════
// Channels Management (useOmnichannelChannels consolidation)
// ═══════════════════════════════════════════════════════════

export function useOmnichannelChannelsManagement(
  _params: UseOmnichannelChannelsParams = {}
): UseOmnichannelChannelsResult {
  const queryClient = useQueryClient();
  const QUERY_KEY = ['omnichannel-channels'];

  const { data: channels = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_connections')
        .select('id, name, channel_type, status')
        .neq('channel_type', 'whatsapp')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OmnichannelChannel[];
    },
    staleTime: 300_000,
  });

  const addChannel = useMutation({
    mutationFn: async (payload: { name: string; channel_type: ChannelType }) => {
      const { error } = await supabase.from('channel_connections').insert({
        name: payload.name,
        channel_type: payload.channel_type,
        status: 'pending_setup',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toastHook({ title: 'Canal adicionado com sucesso' });
    },
    onError: () => {
      toastHook({ title: 'Erro ao adicionar canal', variant: 'destructive' });
    },
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('channel_connections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toastHook({ title: 'Canal removido' });
    },
    onError: () => {
      toastHook({ title: 'Erro ao remover canal', variant: 'destructive' });
    },
  });

  return { channels, isLoading, addChannel, deleteChannel };
}

// ═══════════════════════════════════════════════════════════
// Routing Rules Management (useChannelRoutingRules consolidation)
// ═══════════════════════════════════════════════════════════

export function useChannelRoutingRulesManagement(
  _params: UseChannelRoutingRulesParams = {}
): UseChannelRoutingRulesResult {
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['channel-routing-rules'],
    queryFn: async () => {
      const { data, error } = await safeClient.from('channel_routing_rules', (q) =>
        q
          .select('*, queue:queues(name), channel_connection:channel_connections_safe(name)')
          .order('priority', { ascending: true })
      );
      if (error) throw error;
      return (data ?? []) as RoutingRule[];
    },
    staleTime: 600_000,
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
    staleTime: 600_000,
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
    onError: (err: Error) => toastSonner.error(err.message),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('channel_routing_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
      toastSonner.success('Regra removida');
    },
    onError: (err: Error) => toastSonner.error(err.message),
  });

  const createRule = useMutation({
    mutationFn: async (rule: NewRoutingRule) => {
      const { error } = await supabase.from('channel_routing_rules').insert({
        channel_type: rule.channel_type as Database['public']['Enums']['channel_type'],
        queue_id: rule.queue_id || null,
        priority: rule.priority,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
      toastSonner.success('Regra criada');
    },
    onError: (err: Error) => toastSonner.error(err.message),
  });

  return { rules, isLoading, queues, toggleRule, deleteRule, createRule };
}
