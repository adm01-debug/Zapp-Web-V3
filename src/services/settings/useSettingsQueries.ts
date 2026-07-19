/**
 * Settings Queries Hooks
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api';
import { settingsService } from './index';

export const useUserSettings = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.settings.user(userId || ''),
    queryFn: () => settingsService.getUserSettings(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
};

export const useWorkspaceSettings = (workspaceId?: string) => {
  return useQuery({
    queryKey: queryKeys.settings.workspace(),
    queryFn: () => settingsService.getWorkspaceSettings(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
};
