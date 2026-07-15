/**
 * Settings Service
 *
 * Business logic layer for settings management.
 */

import { settingsRepository, type UserSettings, type WorkspaceSettings } from './settingsRepository';

const VALID_THEMES = ['light', 'dark', 'auto'] as const;
const VALID_LANGUAGES = ['pt-BR', 'en', 'es'] as const;

export const settingsService = {
  // User Settings
  getUserSettings: async (userId: string): Promise<UserSettings | null> => {
    if (!userId) throw new Error('User ID is required');
    return settingsRepository.getUserSettings(userId);
  },

  updateUserSettings: async (userId: string, updates: Partial<UserSettings>): Promise<UserSettings> => {
    if (!userId) throw new Error('User ID is required');

    if (updates.theme && !VALID_THEMES.includes(updates.theme)) {
      throw new Error(`Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}`);
    }

    if (updates.language && !VALID_LANGUAGES.includes(updates.language)) {
      throw new Error(`Invalid language. Must be one of: ${VALID_LANGUAGES.join(', ')}`);
    }

    const { data, error } = await settingsRepository.updateUserSettings(userId, updates);
    if (error) throw error;
    return data;
  },

  upsertUserSettings: async (userId: string, settings: Partial<UserSettings>): Promise<UserSettings> => {
    if (!userId) throw new Error('User ID is required');

    if (settings.theme && !VALID_THEMES.includes(settings.theme)) {
      throw new Error(`Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}`);
    }

    const { data, error } = await settingsRepository.upsertUserSettings(userId, settings);
    if (error) throw error;
    return data;
  },

  // Workspace Settings
  getWorkspaceSettings: async (workspaceId: string): Promise<WorkspaceSettings | null> => {
    if (!workspaceId) throw new Error('Workspace ID is required');
    return settingsRepository.getWorkspaceSettings(workspaceId);
  },

  updateWorkspaceSettings: async (workspaceId: string, updates: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> => {
    if (!workspaceId) throw new Error('Workspace ID is required');

    if (updates.name && updates.name.trim().length === 0) {
      throw new Error('Workspace name cannot be empty');
    }

    const { data, error } = await settingsRepository.updateWorkspaceSettings(workspaceId, updates);
    if (error) throw error;
    return data;
  },

  upsertWorkspaceSettings: async (workspaceId: string, settings: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> => {
    if (!workspaceId) throw new Error('Workspace ID is required');

    const { data, error } = await settingsRepository.upsertWorkspaceSettings(workspaceId, settings);
    if (error) throw error;
    return data;
  },

  // Real-time updates
  onUserSettingsChange: (userId: string, callback: (settings: UserSettings) => void) => {
    return settingsRepository.subscribeToUserSettings(userId, callback);
  },

  onWorkspaceSettingsChange: (workspaceId: string, callback: (settings: WorkspaceSettings) => void) => {
    return settingsRepository.subscribeToWorkspaceSettings(workspaceId, callback);
  },
};
