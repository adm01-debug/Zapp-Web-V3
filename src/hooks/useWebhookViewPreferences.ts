// Re-export from consolidated useSettingsManagement module (ETAPA 41 consolidation)
import { useWebhookViewPreferencesManagement } from '@/hooks/useSettingsManagement';

export function useWebhookViewPreferences(userId?: string) {
  return useWebhookViewPreferencesManagement(userId);
}
