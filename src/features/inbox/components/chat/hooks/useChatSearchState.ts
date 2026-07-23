import { useState, useCallback } from 'react';

/** Hook: use Chat Search State. */
export function useChatSearchState() {
  const [highlightedMessageIds, setHighlightedMessageIds] = useState<Set<string>>(new Set());
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const resetSearch = useCallback(() => {
    setHighlightedMessageIds(new Set());
    setActiveHighlightId(null);
    setSearchQuery('');
  }, []);

  const handleHighlightChange = useCallback((ids: Set<string>, activeId: string | null) => {
    setHighlightedMessageIds(ids);
    setActiveHighlightId(activeId);
  }, []);

  return {
    highlightedMessageIds,
    setHighlightedMessageIds,
    activeHighlightId,
    setActiveHighlightId,
    searchQuery,
    setSearchQuery,
    resetSearch,
    handleHighlightChange
  };
}
