// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { usePersonalStickersManagement } from '@/hooks/useMediaManagement';

export function usePersonalStickers(userId?: string) {
  return usePersonalStickersManagement(userId);
}
