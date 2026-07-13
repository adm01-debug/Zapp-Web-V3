// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicPipelineManagement } from '@/hooks/business-logic/useBusinessLogicManagement';
import type { PipelineStage, UseBusinessLogicPipelineParams, UseBusinessLogicPipelineResult } from '@/hooks/business-logic/useBusinessLogicManagement';

export { useBusinessLogicPipelineManagement as useSalesPipeline };
export type { PipelineStage, UseBusinessLogicPipelineParams, UseBusinessLogicPipelineResult };

export function useSalesPipeline() {
  return useBusinessLogicPipelineManagement();
}
