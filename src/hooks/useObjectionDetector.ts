// Re-export from consolidated useAdvancedFeaturesManagement module (ETAPA 50 consolidation)
import { useObjectionDetectorManagement } from '@/hooks/useAdvancedFeaturesManagement';
import type { ChatMessage } from '@/features/inbox/types/aiChatMessage';
import type { ToneKey } from '@/features/inbox/components/ai-tools/ToneSelector';

export function useObjectionDetector(
  contactId: string,
  contactName: string | undefined,
  lastMessages: string[],
  allMessages: ChatMessage[]
) {
  return useObjectionDetectorManagement(contactId, contactName, lastMessages, allMessages);
}
