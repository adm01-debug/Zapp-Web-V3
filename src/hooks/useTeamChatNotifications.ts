// @ts-nocheck
// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useTeamChatNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { TeamChatNotification } from '@/hooks/useNotificationManagement';

export type { TeamChatNotification };

/** Subscribes to real-time team chat notifications with read status tracking. */
export function useTeamChatNotifications() {
  return useTeamChatNotificationsManagement();
}