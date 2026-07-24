import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { sanitizePostgrestFilter } from '@/lib/sanitize';

/** K B Article interface definition. */
export interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/** Searches published knowledge base articles by title/content/tags. */
export function useKnowledgeBaseSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['kb-search', debouncedQuery],
    queryFn: async (): Promise<KBArticle[]> => {
      const term = sanitizePostgrestFilter(debouncedQuery.trim());
      const pattern = `%${term}%`;
      const { data, error } = await supabase
        .from('knowledge_base_articles')
        .select('id, title, content, category, tags')
        .eq('is_published', true)
        .or(`title.ilike.${pattern},content.ilike.${pattern}`)
        .limit(20);
      if (error) {
        log.error('Knowledge base search error:', error);
        return [];
      }
      return (data as KBArticle[]) ?? [];
    },
    enabled: debouncedQuery.trim().length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
  });

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setQuery('');
    setDebouncedQuery('');
  }, []);

  return {
    query,
    handleSearch,
    clear,
    articles,
    isLoading,
    hasResults: articles.length > 0,
  };
}
