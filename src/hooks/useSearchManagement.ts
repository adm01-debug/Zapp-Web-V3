// Consolidated Search & Discovery Management Module (ETAPA 36)
// Consolidates: useGlobalSearchShortcut, useKnowledgeBaseSearch, useSearchHistory, useSearchInsights, useChatSearch
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      if (mountedRef.current) setResults([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error: err } = await supabase.rpc('search_knowledge_base', {
        search_query: searchQuery,
      });

      if (err) throw err;
      if (mountedRef.current) setResults(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Knowledge base search error:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    search(query);
  }, [query, search]);

  return { results, loading };
}

/** Manages search history with persistence, add, and clear operations. */
export function useSearchHistoryManagement() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('search_history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (err) throw err;
      if (mountedRef.current) setHistory(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching search history:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const addToHistory = useCallback(
    async (query: string, resultType: string) => {
      try {
        await (supabase as any).from('search_history').insert({ query, result_type: resultType }); // ignore-audit — table not in generated types; exists in zapp schema
        await fetchHistory();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error adding to history:', err);
        }
      }
    },
    [fetchHistory, mountedRef]
  );

  const clearHistory = useCallback(async () => {
    try {
      await (supabase as any).from('search_history').delete().gt('id', 0); // ignore-audit — table not in generated types; exists in zapp schema
      if (mountedRef.current) setHistory([]);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error clearing history:', err);
      }
    }
  }, [mountedRef]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, addToHistory, clearHistory, refetch: fetchHistory };
}

export interface SearchInsightsTopQuery {
  query: string;
  count: number;
}

export interface SearchInsightsZeroResult {
  query: string;
  attempts: number;
}

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

function toStringSafe(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toTopQueries(value: unknown): SearchInsightsTopQuery[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return { query: toStringSafe(r.query), count: toFiniteNumber(r.count) };
  });
}

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
  const [insights, setInsights] = useState<SearchInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const { data, error: err } = await (supabase as any).rpc('get_search_insights', { // ignore-audit — RPC not in generated types; exists in zapp schema
          days: timeWindow,
        });

        if (err) throw err;
        setInsights(normalizeSearchInsights(data));
      } catch (err) {
        log.error('Error fetching search insights:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [timeWindow]);

  return { insights, loading };
}



/** Searches messages within a specific chat by ID and query. */
export function useChatSearchManagement(chatId: string, query: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim() || !chatId) {
      setResults([]);
      return;
    }

    const search = async () => {
      try {
        setLoading(true);
        const { data, error: err } = await (supabase as any).rpc('search_chat_messages', { // ignore-audit — RPC not in generated types; exists in zapp schema
          chat_id: chatId,
          search_query: query,
        });

        if (err) throw err;
        setResults(data || []);
      } catch (err) {
        log.error('Chat search error:', err);
      } finally {
        setLoading(false);
      }
    };

    search();
  }, [chatId, query]);

  return { results, loading };
}

export type { SearchResult, SearchHistoryEntry };