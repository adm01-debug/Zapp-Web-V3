// Re-export from consolidated useNotificationManagement module (ETAPA 38 consolidation)
import { useNotificationSettingsManagement } from '@/hooks/useNotificationManagement';
import type { NotificationSettings, SoundTypeOption } from '@/hooks/useNotificationManagement';

export type { NotificationSettings, SoundTypeOption };

/** Fetches and updates notification preferences including email, push, and SMS settings. */
export const useNotificationSettings = () => {
  return useNotificationSettingsManagement();
};
