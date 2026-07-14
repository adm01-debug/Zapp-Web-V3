// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { usePersonalStickersManagement } from '@/hooks/useMediaManagement';

/** Manages personal sticker collections and user-specific sticker data. */
export function usePersonalStickers(userId?: string) {
  return usePersonalStickersManagement(userId);
}
