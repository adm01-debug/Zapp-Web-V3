import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import type { TalkXCampaign } from '@/hooks/useTalkX';

export function useTalkXCampaignLive(campaignId: string) {
  return useQuery<TalkXCampaign | null>({
    queryKey: queryKeys.talkx.campaignLiveById(campaignId),
    refetchInterval: 3000,
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
