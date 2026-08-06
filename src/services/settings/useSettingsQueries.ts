/**
 * Settings Queries Hooks
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api';
import { settingsService } from './index';
import { QUERY_STALE_TIMES, QUERY_GC_TIMES } from '@/lib/queryStaleTimes';

/** Query hook that fetches user-specific settings, enabled only when a userId is provided. */
export const useUserSettings = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.settings.user(userId || ''),
    queryFn: () => settingsService.getUserSettings(userId ?? ''),
    enabled: !!userId,
    staleTime: QUERY_STALE_TIMES.userSettings,
    gcTime: QUERY_GC_TIMES.userSettings,
  });
};

/** use Workspace Settings constant. */
export const useWorkspaceSettings = (workspaceId?: string) => {
  return useQuery({
    queryKey: queryKeys.settings.workspace(),
    queryFn: () => settingsService.getWorkspaceSettings(workspaceId ?? ''),
    enabled: !!workspaceId,
    staleTime: QUERY_STALE_TIMES.userSettings,
    gcTime: QUERY_GC_TIMES.userSettings,
  });
};
