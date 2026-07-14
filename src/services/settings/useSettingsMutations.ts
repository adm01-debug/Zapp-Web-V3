/**
 * Settings Mutations Hooks
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api';
import { settingsService, type UserSettings, type WorkspaceSettings } from './index';

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
