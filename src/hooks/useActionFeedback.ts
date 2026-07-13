// Re-export from consolidated useAdvancedFeaturesManagement module (ETAPA 50 consolidation)
import {
  useActionFeedbackManagement,
  useOptimisticActionManagement,
  useConfirmActionManagement
} from '@/hooks/useAdvancedFeaturesManagement';
export type {
  FeedbackType,
  FeedbackOptions,
  WithFeedbackOptions,
  UndoableOptions,
} from '@/hooks/useAdvancedFeaturesManagement';

export function useActionFeedback() {
  return useActionFeedbackManagement();
}

export function useOptimisticAction<T>() {
  return useOptimisticActionManagement<T>();
}

export function useConfirmAction() {
  return useConfirmActionManagement();
}
