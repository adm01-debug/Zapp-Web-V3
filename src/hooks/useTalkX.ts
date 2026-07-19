import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useTalkX');

/** Lightweight TalkX campaign shape used before the canonical type was available. Prefer the typed version below for new code. */
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

/** Lightweight TalkX recipient shape mirroring talkx_recipients rows. */
export interface TalkXRecipient {
  id: string;
  campaign_id: string;
  contact_id?: string;
  phone?: string;
  status?: string;
  [key: string]: unknown;
}

/** Manages TalkX broadcast campaigns: listing, creating, pausing, resuming, archiving, and recipient tracking. Uses a stable refetch callback to avoid useCallback identity churn. */
export function useTalkX() {
  const queryClient = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['talkx-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_campaigns')
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
        .from('talkx_recipients')
        .select('*')
        .eq('campaign_id', selectedCampaignId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalkXRecipient[];
    },
    enabled: !!selectedCampaignId,
  });

  const createCampaign = useMutation({
    mutationFn: async (campaign: Omit<TalkXCampaign, 'id' | 'created_at'>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .insert({ ...campaign, created_by: user?.id ?? null } as never)
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
        .from('talkx_campaigns')
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
      const { error } = await supabase.from('talkx_campaigns').delete().eq('id', id);
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

  const { refetch: refetchCampaigns } = campaignsQuery;

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

/**
 * TalkXCampaign — tipo estrutural para campanhas do Talk X.
 * Mantido aqui como fonte canônica pois a tabela `talkx_campaigns`
 * ainda não possui tipos gerados no schema `zapp`.
 */
export interface TalkXCampaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | string;
  message_template: string | null;
  media_type: string | null;
  media_url: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at?: string | null;
  sent_count: number;
  failed_count: number;
  total_recipients: number;
  send_interval_min: number;
  send_interval_max: number;
  typing_delay_min: number;
  typing_delay_max: number;
  whatsapp_connection_id: string | null;
  created_by?: string | null;
  workspace_id?: string | null;
  [key: string]: unknown;
}

/**
 * TalkXRecipient — destinatário de uma campanha Talk X.
 */
export interface TalkXRecipient {
  id: string;
  campaign_id: string;
  phone: string;
  name: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  variables?: Record<string, unknown> | null;
  personalized_message?: string | null;
  contacts?: {
    name?: string | null;
    nickname?: string | null;
    avatar_url?: string | null;
  } | null;
  [key: string]: unknown;
}
