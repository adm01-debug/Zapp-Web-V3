// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useSearchHistoryManagement, type SearchHistoryItem } from '@/hooks/useSearchManagement';

export type { SearchHistoryItem };

export function useSearchHistory() {
  return useSearchHistoryManagement();
}
