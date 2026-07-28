import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import type { TalkXCampaign } from '@/hooks/useTalkX';

/**
 * FIX 2026-07-28: Polling interval aumentado de 3s para 15s.
 * MOTIVO: 3s é excessivo para campanhas de broadcast.
 */
export function useTalkXCampaignLive(campaignId: string) {
  return useQuery<TalkXCampaign | null>({
    queryKey: queryKeys.talkx.campaignLiveById(campaignId),
    refetchInterval: 15000, // 15s polling (era 3000)
    staleTime: 13_000,
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .select('*')
        .eq('id', campaignId)
        .maybeSingle();
      if (error) throw error;
      return data as TalkXCampaign;
    },
  });
}
