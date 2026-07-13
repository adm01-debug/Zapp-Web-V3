// Re-export from consolidated useNotificationManagement module (ETAPA 38 consolidation)
import { useNotificationSettingsManagement } from '@/hooks/useNotificationManagement';
import type { NotificationSettings, SoundTypeOption } from '@/hooks/useNotificationManagement';

export type { NotificationSettings, SoundTypeOption };

export const useNotificationSettings = () => {
  return useNotificationSettingsManagement();
};
