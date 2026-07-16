// Consolidated Search & Navigation Management Module (ETAPA 45)
// Consolidates: useContactsSearch, useDashboardQueries, useUrlFilters, useNavigationHistory, useIndexNavigation, useChatSearch
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';

interface SearchResult {
  id: string;
  title: string;
  type: string;
  score: number;
}

interface NavigationState {
  current: string;
  history: string[];
  forward: string[];
}

/** Searches contacts by name or phone with query support and loading state. */
export function useContactsSearchManagement(query?: string) {
  const { user } = useAuth();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const search = useCallback(async () => {
    if (!user || !query) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('contacts')
        .select('*')
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%`);

      if (err) throw err;
      if (mountedRef.current) setResults(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error searching contacts:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, query]);

  useEffect(() => {
    if (query) search();
  }, [query, search]);

  return { results, loading, search };
}

/** Fetches and manages user's saved dashboard queries with loading state. */
export function useDashboardQueriesManagement() {
  const { user } = useAuth();
  const [queries, setQueries] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchQueries = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('dashboard_queries')
        .select('*')
        .eq('user_id', user.id);

      if (err) throw err;
      if (mountedRef.current) setQueries(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching dashboard queries:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchQueries();
  }, [user, fetchQueries]);

  return { queries, loading, refetch: fetchQueries };
}

/** Manages URL filter state with update and clear operations. */
export function useUrlFiltersManagement() {
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const updateFilter = useCallback((key: string, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  return { filters, updateFilter, clearFilters };
}

/** Manages navigation history with back, forward, and navigate capabilities. */
export function useNavigationHistoryManagement() {
  const [state, setState] = useState<NavigationState>({
    current: '',
    history: [],
    forward: [],
  });

  const navigate = useCallback((path: string) => {
    setState((prev) => ({
      current: path,
      history: [...prev.history, prev.current],
      forward: [],
    }));
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => {
      if (prev.history.length === 0) return prev;
      const newCurrent = prev.history[prev.history.length - 1];
      return {
        current: newCurrent,
        history: prev.history.slice(0, -1),
        forward: [prev.current, ...prev.forward],
      };
    });
  }, []);

  const goForward = useCallback(() => {
    setState((prev) => {
      if (prev.forward.length === 0) return prev;
      const newCurrent = prev.forward[0];
      return {
        current: newCurrent,
        history: [...prev.history, prev.current],
        forward: prev.forward.slice(1),
      };
    });
  }, []);

  return { ...state, navigate, goBack, goForward };
}

/** Manages navigation through a list of items with index tracking and movement. */
export function useIndexNavigationManagement() {
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<unknown[]>([]);

  const next = useCallback(() => {
    setIndex((prev) => Math.min(prev + 1, items.length - 1));
  }, [items.length]);

  const previous = useCallback(() => {
    setIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(i, items.length - 1)));
    },
    [items.length]
  );

  return { index, items, setItems, next, previous, goTo, currentItem: items[index] };
}

/** Searches messages within a specific chat by content query. */
export function useChatSearchManagement(chatId?: string, query?: string) {
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const search = useCallback(async () => {
    if (!chatId || !query) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .or(`content.ilike.%${query}%`);

      if (err) throw err;
      if (mountedRef.current) setResults(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error searching chat:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [chatId, query]);

  useEffect(() => {
    if (query) search();
  }, [query, search]);

  return { results, loading, search };
}

export type { SearchResult, NavigationState };
