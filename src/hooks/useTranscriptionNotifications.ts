// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useTranscriptionNotificationsManagement } from '@/hooks/useNotificationManagement';

/** Subscribes to real-time transcription completion and processing status notifications. */
export function useTranscriptionNotifications() {
  return useTranscriptionNotificationsManagement();
}
