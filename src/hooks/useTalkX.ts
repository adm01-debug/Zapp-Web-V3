import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useTalkX');

// Canonical interfaces TalkXCampaign and TalkXRecipient are declared at the bottom of this file.

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
    staleTime: 60_000,
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
    mutationFn: async (campaign: Partial<TalkXCampaignInput>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .insert({
          name: campaign.name ?? '',
          status: campaign.status ?? 'draft',
          message_template: campaign.message_template ?? '',
          media_type: campaign.media_type ?? null,
          media_url: campaign.media_url ?? null,
          scheduled_at: campaign.scheduled_at ?? null,
          started_at: campaign.started_at ?? null,
          completed_at: campaign.completed_at ?? null,
          delivered_count: 0,
          sent_count: campaign.sent_count ?? 0,
          failed_count: campaign.failed_count ?? 0,
          total_recipients: campaign.total_recipients ?? 0,
          send_interval_min: campaign.send_interval_min ?? 0,
          send_interval_max: campaign.send_interval_max ?? 0,
          typing_delay_min: campaign.typing_delay_min ?? 0,
          typing_delay_max: campaign.typing_delay_max ?? 0,
          whatsapp_connection_id: campaign.whatsapp_connection_id ?? null,
          created_by: user?.id ?? null,
        })
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
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TalkXCampaignInput>) => {
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .update({
          name: updates.name,
          status: updates.status,
          message_template: updates.message_template ?? undefined,
          media_type: updates.media_type,
          media_url: updates.media_url,
          scheduled_at: updates.scheduled_at,
          started_at: updates.started_at,
          completed_at: updates.completed_at,
          sent_count: updates.sent_count,
          failed_count: updates.failed_count,
          total_recipients: updates.total_recipients,
          send_interval_min: updates.send_interval_min,
          send_interval_max: updates.send_interval_max,
          typing_delay_min: updates.typing_delay_min,
          typing_delay_max: updates.typing_delay_max,
          whatsapp_connection_id: updates.whatsapp_connection_id,
        })
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

  const startCampaign = useCallback(
    async (id: string) => {
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
    },
    [queryClient]
  );

  const pauseCampaign = useCallback(
    async (id: string) => {
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
    },
    [queryClient]
  );

  const cancelCampaign = useCallback(
    async (id: string) => {
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
    },
    [queryClient]
  );

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
 * TalkXCampaignInput — payload de criação/atualização de campanha.
 * Shape explícito SEM index signature: `Omit<TalkXCampaign, ...>` degenera para
 * `{[key: string]: unknown}` (keyof vira `string` por causa do index signature),
 * o que tornava todos os campos `unknown` e exigia `as never` no insert/update.
 */
export interface TalkXCampaignInput {
  name: string;
  status: string;
  message_template: string | null;
  media_type: string | null;
  media_url: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  sent_count: number;
  failed_count: number;
  total_recipients: number;
  send_interval_min: number;
  send_interval_max: number;
  typing_delay_min: number;
  typing_delay_max: number;
  whatsapp_connection_id: string | null;
}

/**
 * TalkXRecipient — destinatário de uma campanha Talk X.
 * Alinhado ao shape real da tabela `talkx_recipients` (campos anuláveis).
 */
export interface TalkXRecipient {
  id: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  created_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
  request_id: string | null;
  sent_at: string | null;
  status: string;
  updated_at: string | null;
  phone?: string | null;
  name?: string | null;
  variables?: Record<string, unknown> | null;
  contacts?: {
    name?: string | null;
    nickname?: string | null;
    phone?: string | null;
    company?: string | null;
    avatar_url?: string | null;
  } | null;
  [key: string]: unknown;
}
