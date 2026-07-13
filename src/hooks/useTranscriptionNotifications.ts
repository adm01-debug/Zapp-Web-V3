// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useTranscriptionNotificationsManagement } from '@/hooks/useNotificationManagement';

export function useTranscriptionNotifications() {
  return useTranscriptionNotificationsManagement();
}
