// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicPipelineManagement } from '@/features/business-logic/hooks/useBusinessLogicManagement';
import type {
  PipelineStage,
  UseBusinessLogicPipelineParams,
  UseBusinessLogicPipelineResult,
} from '@/features/business-logic/hooks/useBusinessLogicManagement';

export { useBusinessLogicPipelineManagement as useSalesPipeline };
export type { PipelineStage, UseBusinessLogicPipelineParams, UseBusinessLogicPipelineResult };
