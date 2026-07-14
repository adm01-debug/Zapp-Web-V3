// @ts-nocheck
// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useSearchHistoryManagement, type SearchHistoryItem } from '@/hooks/useSearchManagement';

export type { SearchHistoryItem };

/** Provides access to search history with add and clear operations. */
export function useSearchHistory() {
  return useSearchHistoryManagement();
}
