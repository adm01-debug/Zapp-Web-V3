// Re-export from consolidated useSettingsManagement module (ETAPA 41 consolidation)
import { useGlobalSettingsManagement } from '@/hooks/useSettingsManagement';

export function useGlobalSettings() {
  return useGlobalSettingsManagement();
}
