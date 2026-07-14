// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { useCustomEmojisManagement } from '@/hooks/useMediaManagement';

export function useCustomEmojis() {
  return useCustomEmojisManagement();
}

