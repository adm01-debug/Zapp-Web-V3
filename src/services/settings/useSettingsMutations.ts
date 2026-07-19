/**
 * Settings Mutations Hooks
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api';
import { settingsService, type UserSettings, type WorkspaceSettings } from './index';

/** Mutation hook for updating user-specific settings; invalidates the user settings query cache on success. */
export const useUpdateUserSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, settings }: { userId: string; settings: Partial<UserSettings> }) =>
      settingsService.updateUserSettings(userId, settings),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.user(userId) });
    },
  });
};

/** use Upsert User Settings constant. */
export const useUpsertUserSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, settings }: { userId: string; settings: Partial<UserSettings> }) =>
      settingsService.upsertUserSettings(userId, settings),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.user(userId) });
    },
  });
};

/** use Update Workspace Settings constant. */
export const useUpdateWorkspaceSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, settings }: { workspaceId: string; settings: Partial<WorkspaceSettings> }) =>
      settingsService.updateWorkspaceSettings(workspaceId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.workspace() });
    },
  });
};

/** use Upsert Workspace Settings constant. */
export const useUpsertWorkspaceSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, settings }: { workspaceId: string; settings: Partial<WorkspaceSettings> }) =>
      settingsService.upsertWorkspaceSettings(workspaceId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.workspace() });
    },
  });
};
