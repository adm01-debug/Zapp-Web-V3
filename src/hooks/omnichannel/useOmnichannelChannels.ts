/**
 * useOmnichannelChannels — Wave 3 batch-3 (2026-07-06)
 * Camada de dados extraída de OmnichannelManager. Query keys e semântica
 * preservadas; resets de formulário via onSuccess no call-site.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export type ChannelType = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'webchat' | 'email';

export interface ChannelConnection {
  id: string;
  channel_type: ChannelType;
  name: string;
  status: string;
  is_active: boolean;
  external_account_id: string | null;
  created_at: string;
}

export function useOmnichannelChannels() {
  const queryClient = useQueryClient();

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['channel-connections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_connections_safe')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ChannelConnection[];
    },
  });

  const addChannel = useMutation({
    mutationFn: async (channel: { name: string; channel_type: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const { error: insertErr } = await supabase.from('channel_connections').insert([{
        name: channel.name,
        channel_type: channel.channel_type as Database["public"]["Enums"]["channel_type"],
        created_by: profile?.id,
        status: 'pending_setup',
      }]);
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      toast.success('Canal adicionado! Configure as credenciais para ativá-lo.');
    },
    onError: () => toast.error('Erro ao adicionar canal'),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('channel_connections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      toast.success('Canal removido');
    },
  });

  return { channels, isLoading, addChannel, deleteChannel };
}
