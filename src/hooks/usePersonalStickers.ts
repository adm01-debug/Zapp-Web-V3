// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { usePersonalStickersManagement } from '@/hooks/useMediaManagement';

/** Hook: use Personal Stickers. */
export function usePersonalStickers(userId?: string) {
  return usePersonalStickersManagement(userId);
}
