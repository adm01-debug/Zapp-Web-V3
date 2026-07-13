// Re-export from consolidated useSettingsManagement module (ETAPA 41 consolidation)
import { useOnboardingChecklistManagement } from '@/hooks/useSettingsManagement';

export function useOnboardingChecklist(userId?: string) {
  return useOnboardingChecklistManagement(userId);
}
