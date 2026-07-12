import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ABVariant {
  id: string;
  variant_name: string;
  message_content: string;
  send_count: number;
  delivered_count: number;
  read_count: number;
  response_count: number;
  is_winner: boolean;
}

export function useCampaignABTesting(campaignId: string) {
  const [variants, setVariants] = useState<ABVariant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVariants = useCallback(async () => {
    if (!campaignId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('campaign_ab_variants')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at');
    if (!error && data) {
      setVariants(
        data.map((v) => ({
          id: v.id,
          variant_name: v.variant_name,
          message_content: v.message_content,
          send_count: v.send_count ?? 0,
          delivered_count: v.delivered_count ?? 0,
          read_count: v.read_count ?? 0,
          response_count: v.response_count ?? 0,
          is_winner: v.is_winner ?? false,
        }))
      );
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void fetchVariants();
  }, [fetchVariants]);

  const addVariant = async (name: string, content: string): Promise<boolean> => {
    const { error } = await supabase.from('campaign_ab_variants').insert({
      campaign_id: campaignId,
      variant_name: name,
      message_content: content,
    });
    if (error) {
      toast({ title: 'Erro ao criar variante', variant: 'destructive' });
      return false;
    }
    await fetchVariants();
    return true;
  };

  const deleteVariant = async (id: string): Promise<void> => {
    const { error } = await supabase.from('campaign_ab_variants').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir variante', variant: 'destructive' });
      return;
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const declareWinner = async (id: string): Promise<void> => {
    await supabase
      .from('campaign_ab_variants')
      .update({ is_winner: false })
      .eq('campaign_id', campaignId);
    const { error } = await supabase
      .from('campaign_ab_variants')
      .update({ is_winner: true })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro ao declarar vencedor', variant: 'destructive' });
      return;
    }
    setVariants((prev) => prev.map((v) => ({ ...v, is_winner: v.id === id })));
  };

  return { variants, loading, addVariant, deleteVariant, declareWinner };
}
