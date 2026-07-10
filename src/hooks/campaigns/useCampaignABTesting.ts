// @ts-nocheck — strict-mode retrofit pendente (ver docs/STRICT_MODE_BACKLOG.md)
/**
 * useCampaignABTesting — Wave 3 tier-2 (2026-07-06)
 * Camada de dados extraída de CampaignABTesting. addVariant retorna sucesso
 * para o componente resetar o formulário (paridade de comportamento).
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ABVariant {
  id: string;
  campaign_id: string;
  variant_name: string;
  message_content: string;
  media_url: string | null;
  send_count: number;
  delivered_count: number;
  read_count: number;
  response_count: number;
  is_winner: boolean;
}

export function useCampaignABTesting(campaignId: string) {
  const [variants, setVariants] = useState<ABVariant[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('campaign_ab_variants')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at');
    if (data) {
      const typedVariants: ABVariant[] = (data ?? []).map(v => ({
        ...v,
        send_count: v.send_count || 0,
        delivered_count: v.delivered_count || 0,
        read_count: v.read_count || 0,
        response_count: v.response_count || 0
      }));
      setVariants(typedVariants);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { loadVariants(); }, [loadVariants]);

  const addVariant = async (rawName: string, content: string): Promise<boolean> => {
    if (!content.trim()) return false;
    const name = rawName || String.fromCharCode(65 + variants.length);
    const { error } = await supabase.from('campaign_ab_variants').insert({
      campaign_id: campaignId,
      variant_name: name,
      message_content: content.trim(),
    });
    if (!error) {
      toast.success(`Variante ${name} criada`);
      loadVariants();
      return true;
    }
    return false;
  };

  const deleteVariant = async (id: string) => {
    await supabase.from('campaign_ab_variants').delete().eq('id', id);
    toast.success('Variante removida');
    loadVariants();
  };

  const declareWinner = async (id: string) => {
    await supabase.from('campaign_ab_variants').update({ is_winner: false }).eq('campaign_id', campaignId);
    await supabase.from('campaign_ab_variants').update({ is_winner: true }).eq('id', id);
    toast.success('Vencedor declarado!');
    loadVariants();
  };

  return { variants, loading, loadVariants, addVariant, deleteVariant, declareWinner };
}
