import { useUserSettingsManagement } from '@/hooks/useSettingsManagement';

export type { UserSettings } from '@/hooks/userSettingsSchema';

export function useUserSettings(userId?: string) {
  return useUserSettingsManagement(userId);
}
