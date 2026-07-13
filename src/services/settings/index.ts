/**
 * Settings Service Index
 */

export { settingsRepository, type UserSettings, type WorkspaceSettings } from './settingsRepository';
export { settingsService } from './settingsService';
export { useUserSettings, useWorkspaceSettings } from './useSettingsQueries';
export {
  useUpdateUserSettings,
  useUpsertUserSettings,
  useUpdateWorkspaceSettings,
  useUpsertWorkspaceSettings,
} from './useSettingsMutations';
