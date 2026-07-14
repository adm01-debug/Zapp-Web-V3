// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useTeamChatNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { TeamChatNotification } from '@/hooks/useNotificationManagement';

export type { TeamChatNotification };

export function useTeamChatNotifications() {
  return useTeamChatNotificationsManagement();
}
