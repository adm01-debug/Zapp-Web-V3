import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useTalkX');

export interface TalkXCampaign {
  id: string;
  name: string;
  message_content?: string;
  description?: string;
  message_type?: string;
  target_type?: string;
  status?: string;
  send_interval_seconds?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface TalkXRecipient {
  id: string;
  campaign_id: string;
  contact_id?: string;
  phone?: string;
  status?: string;
  [key: string]: unknown;
}

export function useTalkX() {
  const queryClient = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['talkx-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalkXCampaign[];
    },
  });

  const recipientsQuery = useQuery({
    queryKey: ['talkx-recipients', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', selectedCampaignId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalkXRecipient[];
    },
    enabled: !!selectedCampaignId,
  });

  const createCampaign = useMutation({
    mutationFn: async (campaign: Omit<TalkXCampaign, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert(campaign as never)
        .select()
        .single();
      if (error) throw error;
      return data as TalkXCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha criada!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TalkXCampaign> & { id: string }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates as never)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as TalkXCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha atualizada!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      if (selectedCampaignId) setSelectedCampaignId(null);
      toast.success('Campanha excluída!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const addRecipients = useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: {
      campaignId: string;
      contactIds: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('talkx-add-recipients', {
        body: { campaignId, contactIds },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-recipients', selectedCampaignId] });
      toast.success('Destinatários adicionados!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const startCampaign = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('talkx-control', {
        body: { action: 'start', campaignId: id },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha iniciada!');
    } catch (err) {
      log.error('startCampaign error', err);
      toast.error('Erro ao iniciar campanha');
    }
  }, [queryClient]);

  const pauseCampaign = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('talkx-control', {
        body: { action: 'pause', campaignId: id },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha pausada!');
    } catch (err) {
      log.error('pauseCampaign error', err);
      toast.error('Erro ao pausar campanha');
    }
  }, [queryClient]);

  const cancelCampaign = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('talkx-control', {
        body: { action: 'cancel', campaignId: id },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha cancelada!');
    } catch (err) {
      log.error('cancelCampaign error', err);
      toast.error('Erro ao cancelar campanha');
    }
  }, [queryClient]);

  const refetchCampaigns = useCallback(() => {
    return campaignsQuery.refetch();
  }, [campaignsQuery]);

  return {
    campaigns: campaignsQuery.data ?? [],
    isLoading: campaignsQuery.isLoading,
    selectedCampaignId,
    setSelectedCampaignId,
    recipients: recipientsQuery.data ?? [],
    createCampaign,
    updateCampaign,
    deleteCampaign,
    addRecipients,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    refetchCampaigns,
  };
}
