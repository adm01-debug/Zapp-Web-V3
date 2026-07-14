// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { useCustomEmojisManagement } from '@/hooks/useMediaManagement';

/** Fetches and manages custom emoji library with caching. */
export function useCustomEmojis() {
  return useCustomEmojisManagement();
}

