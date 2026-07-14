// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicCampaignsManagement } from '@/hooks/business-logic/useBusinessLogicManagement';
import type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult } from '@/hooks/business-logic/useBusinessLogicManagement';

export function useCampaignABTesting(
  params: UseBusinessLogicCampaignsParams | string
): UseBusinessLogicCampaignsResult {
  return useBusinessLogicCampaignsManagement(
    typeof params === 'string' ? { campaignId: params } : params
  );
}

export { useBusinessLogicCampaignsManagement };
export type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult };
