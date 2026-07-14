// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useKnowledgeBaseSearchManagement, type KBArticle } from '@/hooks/useSearchManagement';

export type { KBArticle };

/** Searches knowledge base articles by query. */
export function useKnowledgeBaseSearch() {
  return useKnowledgeBaseSearchManagement();
}
