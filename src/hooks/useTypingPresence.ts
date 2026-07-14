// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useTypingPresenceManagement } from '@/hooks/useRealtimeManagement';

/** Broadcasts typing presence indicators in real-time during chat conversations. */
export function useTypingPresence(params: { userId: string; chatId: string }) {
  return useTypingPresenceManagement(params.userId, params.chatId);
}
