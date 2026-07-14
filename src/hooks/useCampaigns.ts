// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type CampaignRow = Tables<'campaigns'>;
type CampaignInsert = TablesInsert<'campaigns'>;
type CampaignUpdate = TablesUpdate<'campaigns'>;

export type Campaign = CampaignRow & {
  target_filter: Record<string, unknown> | null;
};

/**
 * Payload aceito por `createCampaign.mutate`. Mantém `name` e
 * `message_content` obrigatórios (não `Partial<Campaign>`) para casar com
 * o formulário do `CampaignCreateDialog` e evitar `undefined` em runtime.
 */
export type CampaignInput = {
  name: string;
  message_content: string;
  description?: string;
  message_type?: string;
  target_type?: 'all' | 'custom' | 'queue' | 'tag';
  send_interval_seconds?: number;
};

/** Provides campaigns CRUD operations and contact targeting for campaigns. */
export function useCampaigns() {
  const queryClient = useQueryClient();

  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Campaign[]; // ignore-audit: Campaign.target_filter narrows Supabase Json to Record<string,unknown>
    },
  });

  const createCampaign = useMutation<Campaign, Error, CampaignInput>({
    mutationFn: async (campaign: CampaignInput) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert(campaign as CampaignInsert)
        .select()
        .single();
      if (error) throw error;
      return data as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha criada com sucesso!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });


  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Campaign> & { id: string }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates as CampaignUpdate)
        .eq('id', id)
        .select()
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
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
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha excluída!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const addContactsToCampaign = useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: {
      campaignId: string;
      contactIds: string[];
    }) => {
      const { error } = await supabase.rpc('add_contacts_to_campaign', {
        p_campaign_id: campaignId,
        p_contact_ids: contactIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Contatos adicionados à campanha!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  return {
    campaigns: campaignsQuery.data ?? [],
    isLoading: campaignsQuery.isLoading,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    addContactsToCampaign,
    refetch: campaignsQuery.refetch,
  };
}
