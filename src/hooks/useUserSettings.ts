import { useUserSettingsManagement } from '@/hooks/useSettingsManagement';

export type { UserSettings } from '@/hooks/userSettingsSchema';

/** Hook: use User Settings. */
export function useUserSettings(userId?: string) {
  return useUserSettingsManagement(userId);
}
