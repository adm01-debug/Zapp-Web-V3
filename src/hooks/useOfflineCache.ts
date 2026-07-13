// Re-export from consolidated useAdvancedFeaturesManagement module (ETAPA 50 consolidation)
import { useOfflineCacheManagement } from '@/hooks/useAdvancedFeaturesManagement';
import { ConversationWithMessages } from '@/features/inbox';

export function useOfflineCache(conversations: ConversationWithMessages[], loading: boolean) {
  return useOfflineCacheManagement(conversations, loading);
}
