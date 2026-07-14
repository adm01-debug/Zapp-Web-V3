// Re-export from consolidated useSettingsManagement module (ETAPA 41 consolidation)
import { useGlobalSettingsManagement } from '@/hooks/useSettingsManagement';

/** Provides access to global application settings and configurations. */
export function useGlobalSettings() {
  return useGlobalSettingsManagement();
}
