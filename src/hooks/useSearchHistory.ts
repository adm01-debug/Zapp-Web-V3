// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useSearchHistoryManagement, type SearchHistoryEntry } from '@/hooks/useSearchManagement';

export type SearchHistoryItem = SearchHistoryEntry;
export type { SearchHistoryEntry };

/** Provides access to search history with add and clear operations. */
export function useSearchHistory() {
  return useSearchHistoryManagement();
}
