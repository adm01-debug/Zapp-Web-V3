// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useRealtimeMessagesManagement } from '@/hooks/useRealtimeManagement';

/** Streams real-time messages for a specific chat with live updates. */
export function useRealtimeMessages(chatId: string) {
  return useRealtimeMessagesManagement(chatId);
}
