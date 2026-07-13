import { useEffect, useCallback, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  resultCount?: number;
}

export interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  rank: number;
}

export interface SearchInsightsTopQuery {
  query: string;
  count: number;
  avg_results: number;
}

export interface SearchInsightsZeroResult {
  query: string;
  count: number;
  last_at: string;
}

export interface SearchInsights {
  total_searches: number;
  unique_queries: number;
  vector_searches: number;
  vector_share: number;
  total_clicks: number;
  click_through_rate: number;
  zero_result_count: number;
  zero_result_rate: number;
  avg_result_count: number;
  top_queries: SearchInsightsTopQuery[];
  zero_result_queries: SearchInsightsZeroResult[];
  window_days: number;
}

interface UseGlobalSearchShortcutParams {
  onOpen: () => void;
}

interface UseSearchHistoryResult {
  history: SearchHistoryItem[];
  addToHistory: (query: string, resultCount?: number) => void;
  removeFromHistory: (query: string) => void;
  clearHistory: () => void;
}

interface UseKnowledgeBaseSearchResult {
  query: string;
  handleSearch: (value: string) => void;
  clear: () => void;
  articles: KBArticle[];
  isLoading: boolean;
  hasResults: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH SHORTCUT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export function useGlobalSearchShortcutManagement(params: UseGlobalSearchShortcutParams) {
  const { onOpen } = params;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onOpen]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// SEARCH HISTORY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

const HISTORY_KEY = 'global-search-history';
const MAX_HISTORY = 10;

export function useSearchHistoryManagement(): UseSearchHistoryResult {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  const addToHistory = useCallback((query: string, resultCount?: number) => {
    if (!query.trim() || query.length < 2) return;

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.query.toLowerCase() !== query.toLowerCase());
      const newHistory = [
        { query: query.trim(), timestamp: Date.now(), resultCount },
        ...filtered,
      ].slice(0, MAX_HISTORY);

      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.query !== query);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
      return filtered;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// SEARCH INSIGHTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

const EMPTY_INSIGHTS: SearchInsights = {
  total_searches: 0,
  unique_queries: 0,
  vector_searches: 0,
  vector_share: 0,
  total_clicks: 0,
  click_through_rate: 0,
  zero_result_count: 0,
  zero_result_rate: 0,
  avg_result_count: 0,
  top_queries: [],
  zero_result_queries: [],
  window_days: 7,
};

export function useSearchInsightsManagement(days: number) {
  return useQuery<SearchInsights>({
    queryKey: ['search-insights', days],
    queryFn: async () => {
      const { data, error } = await safeClient.rpc<SearchInsights>('rpc_search_insights', {
        p_days: days,
      });
      if (error) throw error;
      if (!data || typeof data !== 'object') return { ...EMPTY_INSIGHTS, window_days: days };
      return { ...EMPTY_INSIGHTS, ...data, window_days: days };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE SEARCH MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export function useKnowledgeBaseSearchManagement(): UseKnowledgeBaseSearchResult {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<NodeJS.Timeout>();

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { data: articles, isLoading } = useQuery({
    queryKey: ['knowledge-base-search', debouncedQuery],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_knowledge_base', {
        search_query: debouncedQuery,
        max_results: 5,
      });
      if (error) throw error;
      return (data ?? []) as KBArticle[];
    },
    enabled: debouncedQuery.length >= 2,
  });

  const clear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
  }, []);

  return {
    query,
    handleSearch,
    clear,
    articles: articles ?? [],
    isLoading,
    hasResults: (articles?.length ?? 0) > 0,
  };
}
