// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicCampaignsManagement } from '@/hooks/business-logic/useBusinessLogicManagement';
import type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult } from '@/hooks/business-logic/useBusinessLogicManagement';

export { useBusinessLogicCampaignsManagement as useCampaignABTesting };
export type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult };
