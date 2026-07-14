import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type ChannelType = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'webchat' | 'email';

interface OmnichannelChannel {
  id: string;
  name: string;
  channel_type: ChannelType;
  status: string;
}

const QUERY_KEY = ['omnichannel-channels'];

export function useOmnichannelChannels() {
  const queryClient = useQueryClient();

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
      toast({ title: 'Canal adicionado com sucesso' });
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar canal', variant: 'destructive' });
    },
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('channel_connections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Canal removido' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover canal', variant: 'destructive' });
    },
  });

  return { channels, isLoading, addChannel, deleteChannel };
}
