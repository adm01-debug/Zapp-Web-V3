// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useKnowledgeBaseSearchManagement, type KBArticle } from '@/hooks/useSearchManagement';

export type { KBArticle };

export function useKnowledgeBaseSearch() {
  return useKnowledgeBaseSearchManagement();
}
