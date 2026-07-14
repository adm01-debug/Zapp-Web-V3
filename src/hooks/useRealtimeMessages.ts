// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useRealtimeMessagesManagement } from '@/hooks/useRealtimeManagement';

export function useRealtimeMessages(chatId: string) {
  return useRealtimeMessagesManagement(chatId);
}