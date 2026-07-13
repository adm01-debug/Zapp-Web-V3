// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicCampaignsManagement } from '@/features/business-logic/hooks/useBusinessLogicManagement';
import type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult } from '@/features/business-logic/hooks/useBusinessLogicManagement';

export { useBusinessLogicCampaignsManagement as useCampaignABTesting };
export type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult };

export function useCampaignABTesting(campaignId: string) {
  return useBusinessLogicCampaignsManagement({ campaignId });
}
