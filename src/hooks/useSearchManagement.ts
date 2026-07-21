// @ts-nocheck
// Consolidated Search & Discovery Management Module (ETAPA 36)
// Consolidates: useGlobalSearchShortcut, useKnowledgeBaseSearch, useSearchHistory, useSearchInsights, useChatSearch
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { callExtRpc } from '@/integrations/supabase/externalClient';
import { log } from '@/lib/logger';

interface SearchResult {
  id: string;
  title: string;
  content?: string;
  type: 'message' | 'contact' | 'article' | 'chat';
  score: number;
  timestamp: string;
}

interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: string;
  result_type: string;
  resultCount?: number;
}


/** Manages global search modal with Ctrl+K keyboard shortcut. */
export function useGlobalSearchShortcutManagement(onSearch?: (query: string) => void) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return { isOpen, setIsOpen, onSearch };
}

/** Searches knowledge base articles and returns matching results. */
export function useKnowledgeBaseSearchManagement(query: string) {
  const { data: results = [], isLoading: loading } = useQuery({
    queryKey: ['kb-search', query] as const,
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('search_knowledge_base', {
        search_query: query,
      });
      if (err) {
        log.error('Knowledge base search error:', err);
        return [] as SearchResult[];
      }
      return (data || []) as SearchResult[];
    },
    enabled: !!query.trim(),
    staleTime: 30_000,
  });

  return { results, loading };
}

const SEARCH_HISTORY_KEY = ['search-history'] as const;

/** Manages search history with persistence, add, and clear operations. */
export function useSearchHistoryManagement() {
  const queryClient = useQueryClient();

  const { data: history = [], isLoading: loading, refetch } = useQuery({
    queryKey: SEARCH_HISTORY_KEY,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('search_history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (err) {
        log.error('Error fetching search history:', err);
        throw err;
      }
      return (data || []) as SearchHistoryEntry[];
    },
    staleTime: 30_000,
  });

  const addToHistory = useCallback(
    async (query: string, resultType: string) => {
      try {
        await safeClient.from('search_history', (q) => q.insert({ query, result_type: resultType }));
        void queryClient.invalidateQueries({ queryKey: SEARCH_HISTORY_KEY });
      } catch (err) {
        log.error('Error adding to history:', err);
      }
    },
    [queryClient]
  );

  const clearHistory = useCallback(async () => {
    try {
      await safeClient.from('search_history', (q) => q.delete().gt('id', 0));
      void queryClient.invalidateQueries({ queryKey: SEARCH_HISTORY_KEY });
    } catch (err) {
      log.error('Error clearing history:', err);
    }
  }, [queryClient]);

  return { history, loading, addToHistory, clearHistory, refetch };
}

/** Search Insights Top Query interface definition. */
export interface SearchInsightsTopQuery {
  query: string;
  count: number;
}

/** Search Insights Zero Result interface definition. */
export interface SearchInsightsZeroResult {
  query: string;
  attempts: number;
}

/** Search Insights interface definition. */
export interface SearchInsights {
  top_queries: SearchInsightsTopQuery[];
  zero_results: SearchInsightsZeroResult[];
  total_searches: number;
  unique_queries: number;
  vector_searches: number;
  vector_share: number;
  total_clicks: number;
  click_through_rate: number;
  zero_result_count: number;
  zero_result_rate: number;
}

/** Coerce any value into a finite number, defaulting to 0. */
function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Returns value as a string if it already is one, or fallback when the value is any other type. */
function toStringSafe(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Coerces an unknown array of RPC rows into a typed SearchInsightsTopQuery array, defaulting missing fields. */
function toTopQueries(value: unknown): SearchInsightsTopQuery[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return { query: toStringSafe(r.query), count: toFiniteNumber(r.count) };
  });
}

/** Coerces an unknown array of RPC rows into a typed SearchInsightsZeroResult array, defaulting missing fields. */
function toZeroResults(value: unknown): SearchInsightsZeroResult[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return { query: toStringSafe(r.query), attempts: toFiniteNumber(r.attempts) };
  });
}

/** Type-safe parser: converts an unknown RPC payload into a fully-populated SearchInsights. */
export function normalizeSearchInsights(raw: unknown): SearchInsights {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    total_searches: toFiniteNumber(r.total_searches),
    unique_queries: toFiniteNumber(r.unique_queries),
    vector_searches: toFiniteNumber(r.vector_searches),
    vector_share: toFiniteNumber(r.vector_share),
    total_clicks: toFiniteNumber(r.total_clicks),
    click_through_rate: toFiniteNumber(r.click_through_rate),
    zero_result_count: toFiniteNumber(r.zero_result_count),
    zero_result_rate: toFiniteNumber(r.zero_result_rate),
    top_queries: toTopQueries(r.top_queries),
    zero_results: toZeroResults(r.zero_results ?? r.zero_result_queries),
  };
}

/** Retrieves search insights and trends for specified time window. */
export function useSearchInsightsManagement(timeWindow: number = 7) {
  const { data: insights = null, isLoading: loading } = useQuery({
    queryKey: ['search-insights', timeWindow] as const,
    queryFn: async () => {
      const { data, error: err } = await callExtRpc(supabase, 'get_search_insights', {
        days: timeWindow,
      });
      if (err) {
        log.error('Error fetching search insights:', err);
        return null;
      }
      return normalizeSearchInsights(data);
    },
    staleTime: 60_000,
  });

  return { insights, loading };
}



/** Searches messages within a specific chat by ID and query. */
export function useChatSearchManagement(chatId: string, query: string) {
  const { data: results = [], isLoading: loading } = useQuery({
    queryKey: ['chat-search', chatId, query] as const,
    queryFn: async () => {
      const { data, error: err } = await callExtRpc(supabase, 'search_chat_messages', {
        chat_id: chatId,
        search_query: query,
      });
      if (err) {
        log.error('Chat search error:', err);
        return [] as SearchResult[];
      }
      return (data || []) as SearchResult[];
    },
    enabled: !!query.trim() && !!chatId,
    staleTime: 30_000,
  });

  return { results, loading };
}

/** Re-exported module members. */
export type { SearchResult, SearchHistoryEntry };