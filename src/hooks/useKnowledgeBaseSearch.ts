import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

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
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      if (mountedRef.current) {
        setArticles([]);
        setIsLoading(false);
      }
      return;
    }

    if (mountedRef.current) setIsLoading(true);
    try {
      const pattern = `%${term}%`;
      const { data, error } = await supabase
        .from('knowledge_base_articles')
        .select('id, title, content, category, tags')
        .eq('is_published', true)
        .or(`title.ilike.${pattern},content.ilike.${pattern}`)
        .limit(20);

      if (error) throw error;
      if (mountedRef.current) setArticles((data as KBArticle[]) ?? []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Knowledge base search error:', err);
        setArticles([]);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSearch(value);
    }, DEBOUNCE_MS);
  }, [runSearch]);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setQuery('');
    setArticles([]);
    setIsLoading(false);
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