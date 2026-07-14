// Re-export from consolidated useSettingsManagement module (ETAPA 41 consolidation)
import { useOnboardingChecklistManagement } from '@/hooks/useSettingsManagement';
import { useAuth } from '@/features/auth';

export function useOnboardingChecklist(options?: { enabled?: boolean } | string) {
  const { user } = useAuth();
  const enabled = typeof options === 'object' ? (options.enabled ?? true) : true;
  const explicitUserId = typeof options === 'string' ? options : undefined;
  const result = useOnboardingChecklistManagement(enabled ? (explicitUserId ?? user?.id) : undefined);
  const totalSteps = result.steps.length;
  const completedSteps = result.steps.filter((step) => step.completed).length;

  return {
    ...result,
    isComplete: totalSteps > 0 && completedSteps === totalSteps,
    isDismissed: totalSteps === 0 && !result.loading,
    completedSteps,
    totalSteps,
  };
}
