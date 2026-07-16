import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Message } from '@/types/chat';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatSearch } from '@/features/inbox';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { ChatSearchFilters } from './ChatSearchFilters';
import { ChatSearchResultsList } from './ChatSearchResultsList';

interface ChatSearchBarProps {
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onNavigateToMessage: (messageId: string) => void;
  onHighlightChange: (messageIds: Set<string>, activeId: string | null) => void;
  onSearchQueryChange?: (query: string) => void;
}

export function ChatSearchBar({
  messages,
  isOpen,
  onClose,
  onNavigateToMessage,
  onHighlightChange,
  onSearchQueryChange,
}: ChatSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewListRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    filter,
    setFilter,
    activeIndex,
    setActiveIndex,
    debouncedQuery,
    results,
    filterCounts,
    navigateUp,
    navigateDown,
    datePreset,
    setDatePreset,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    hasDateFilter,
  } = useChatSearch({
    messages,
    isOpen,
    onHighlightChange,
    onNavigateToMessage,
    onSearchQueryChange,
  });

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!previewListRef.current || results.length === 0) return;
    const idx = Math.min(activeIndex, Math.min(results.length, 5) - 1);
    if (idx < 0) return;
    (previewListRef.current.children[idx] as HTMLElement)?.scrollIntoView?.({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [activeIndex, results.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
    if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
      e.preventDefault();
      navigateUp();
    }
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      navigateDown();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="shrink-0 overflow-hidden border-b border-border/40 bg-background/95 backdrop-blur-md"
        >
          <div className="space-y-2.5 px-3 py-3 md:px-4" role="search">
            <div className="flex items-center gap-1.5">
              <div className="relative flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-transparent bg-accent/40 px-4 transition-all duration-300 focus-within:border-primary/20 focus-within:bg-accent/60">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Buscar na conversa..."
                  className="h-full min-w-0 border-none bg-transparent px-0 text-[13px] text-[hsl(var(--foreground))] shadow-none placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-0"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="shrink-0 rounded-full p-1 hover:bg-accent"
                  >
                    <X className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                  </button>
                )}
                {(debouncedQuery.trim() || filter !== 'all' || hasDateFilter) && (
                  <span
                    className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground"
                    aria-live="polite"
                  >
                    {results.length > 0 ? `${activeIndex + 1}/${results.length}` : '0'}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center rounded-xl border border-transparent bg-accent/40">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-8 rounded-l-xl rounded-r-none hover:bg-accent"
                      onClick={navigateUp}
                      disabled={results.length === 0}
                      aria-label="Resultado anterior"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Anterior (Shift+Enter)</TooltipContent>
                </Tooltip>
                <div className="h-5 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-8 rounded-l-none rounded-r-xl hover:bg-accent"
                      onClick={navigateDown}
                      disabled={results.length === 0}
                      aria-label="Próximo resultado"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Próximo (Enter)</TooltipContent>
                </Tooltip>
              </div>
              <Button
                aria-label="Fechar busca"
                variant="ghost"
                size="icon"
                className="h-10 w-8 shrink-0 rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-accent hover:text-[hsl(var(--foreground))]"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ChatSearchFilters
              filter={filter}
              setFilter={setFilter}
              filterCounts={filterCounts}
              debouncedQuery={debouncedQuery}
              hasDateFilter={hasDateFilter}
              datePreset={datePreset}
              setDatePreset={setDatePreset}
              customDateFrom={customDateFrom}
              setCustomDateFrom={setCustomDateFrom}
              customDateTo={customDateTo}
              setCustomDateTo={setCustomDateTo}
            />

            {(debouncedQuery.trim() || filter !== 'all' || hasDateFilter) &&
              results.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground"
                >
                  <Search className="h-4 w-4 opacity-40" />
                  <span className="text-[11px]">
                    {debouncedQuery.trim()
                      ? `Nenhum resultado para "${debouncedQuery.trim().slice(0, 30)}"`
                      : 'Nenhuma mensagem encontrada'}
                  </span>
                </motion.div>
              )}

            {(debouncedQuery.trim() || hasDateFilter) && results.length > 0 && (
              <ChatSearchResultsList
                ref={previewListRef}
                results={results}
                activeIndex={activeIndex}
                debouncedQuery={debouncedQuery}
                onSelect={(idx, id) => {
                  setActiveIndex(idx);
                  onNavigateToMessage(id);
                }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
