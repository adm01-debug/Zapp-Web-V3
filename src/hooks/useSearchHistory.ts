import { useState, useCallback } from 'react';

const STORAGE_KEY = 'global-search-history';
const MAX_HISTORY = 10;

/** Hook: Search History Item. */
export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  resultCount: number;
}

function loadHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchHistoryItem[];
  } catch {
    return [];
  }
}

function saveHistory(items: SearchHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}

/** Hook: use Search History. */
export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>(loadHistory);

  const addToHistory = useCallback((query: string, resultCount: number) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    setHistory((prev) => {
      const filtered = prev.filter((h) => h.query.toLowerCase() !== trimmed.toLowerCase());
      const updated = [{ query: trimmed, timestamp: Date.now(), resultCount }, ...filtered].slice(
        0,
        MAX_HISTORY
      );
      saveHistory(updated);
      return updated;
    });
  }, []);

  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const updated = prev.filter((h) => h.query !== query);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, addToHistory, removeFromHistory, clearHistory };
}
