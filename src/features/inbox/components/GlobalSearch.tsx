import React, { useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  X,
  Plus,
  Command,
  Filter,
  Tag,
  Inbox,
  Zap,
  ArrowRight,
  Settings,
  LayoutDashboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { safeClient } from '@/integrations/supabase/safeClient';
import { log } from '@/lib/logger';
import { useGlobalSearchData, type SearchResult } from './useGlobalSearchData';
import { GlobalSearchFilters } from './search/GlobalSearchFilters';
import { GlobalSearchResults } from './search/GlobalSearchResults';
import { GlobalSearchHistory } from './search/GlobalSearchHistory';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectResult: (result: SearchResult) => void;
}

export function GlobalSearch({ open, onOpenChange, onSelectResult }: GlobalSearchProps) {
  const {
    search,
    isLoading,
    results,
    setResults,
    selectedIndex,
    setSelectedIndex,
    allTags,
    tagSuggestions,
    selectedTags,
    activeTypes,
    dateFilter,
    setDateFilter,
    mediaTypeFilter,
    setMediaTypeFilter,
    showFilters,
    setShowFilters,
    history,
    removeFromHistory,
    clearHistory,
    toggleType,
    handleSearch,
    handleTagSelect,
    removeTag,
    performSearch,
  } = useGlobalSearchData(open);

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        id: 'new-conversation',
        title: 'Nova conversa',
        description: 'Iniciar uma nova conversa',
        icon: <Plus className="h-4 w-4" />,
        action: () => onOpenChange(false),
        keywords: ['nova', 'novo', 'conversa', 'chat', 'iniciar', 'criar'],
      },
      {
        id: 'go-inbox',
        title: 'Ir para Inbox',
        description: 'Abrir caixa de entrada',
        icon: <Inbox className="h-4 w-4" />,
        action: () => {
          onOpenChange(false);
          window.location.hash = '#inbox';
        },
        keywords: ['inbox', 'caixa', 'entrada', 'mensagens'],
      },
      {
        id: 'go-dashboard',
        title: 'Ir para Dashboard',
        description: 'Ver métricas e estatísticas',
        icon: <LayoutDashboard className="h-4 w-4" />,
        action: () => {
          onOpenChange(false);
          window.location.hash = '#dashboard';
        },
        keywords: ['dashboard', 'métricas', 'estatísticas', 'painel'],
      },
      {
        id: 'go-settings',
        title: 'Configurações',
        description: 'Ajustar preferências do sistema',
        icon: <Settings className="h-4 w-4" />,
        action: () => {
          onOpenChange(false);
          window.location.hash = '#settings';
        },
        keywords: ['config', 'configurações', 'preferências', 'ajustes', 'settings'],
      },
      {
        id: 'quick-reply',
        title: 'Respostas rápidas',
        description: 'Gerenciar templates de resposta',
        icon: <Zap className="h-4 w-4" />,
        action: () => onOpenChange(false),
        keywords: ['resposta', 'rápida', 'template', 'templates', 'atalho'],
      },
    ],
    [onOpenChange]
  );

  const filteredActions = useMemo(() => {
    if (!search || search.startsWith('#')) return quickActions;
    const q = search.toLowerCase();
    return quickActions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.keywords.some((k) => k.includes(q))
    );
  }, [search, quickActions]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (search && search.trim().length >= 2) {
        safeClient
          .rpc('rpc_record_search_click', {
            p_query: search.trim(),
            p_result_id: result.id,
            p_result_type: result.type,
          })
          .then(
            ({ error }) => {
              if (error) log.warn('rpc_record_search_click failed', error);
            },
            () => {}
          );
      }
      onSelectResult(result);
      onOpenChange(false);
      handleSearch('');
      setResults([]);
    },
    [onSelectResult, onOpenChange, handleSearch, setResults, search]
  );

  const handleHistorySelect = useCallback(
    (query: string) => {
      handleSearch(query);
      performSearch(query, activeTypes, dateFilter, selectedTags, mediaTypeFilter);
    },
    [handleSearch, performSearch, activeTypes, dateFilter, selectedTags, mediaTypeFilter]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const total = tagSuggestions.length > 0 ? tagSuggestions.length : results.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((p) => (p + 1) % total);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((p) => (p - 1 + total) % total);
      } else if (e.key === 'Enter' && total > 0) {
        e.preventDefault();
        if (tagSuggestions.length > 0) handleTagSelect(tagSuggestions[selectedIndex]);
        else if (results[selectedIndex]) handleSelect(results[selectedIndex]);
      } else if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    open,
    results,
    tagSuggestions,
    selectedIndex,
    handleSelect,
    handleTagSelect,
    onOpenChange,
    setSelectedIndex,
  ]);

  const activeFiltersCount =
    (activeTypes.size < 4 ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0) +
    (mediaTypeFilter !== 'all' ? 1 : 0);
  const showHistory = search.length === 0 && history.length > 0 && tagSuggestions.length === 0;
  const showActions =
    activeTypes.has('action') &&
    filteredActions.length > 0 &&
    (search.length === 0 || search.length >= 1);

  const handleClearFilters = useCallback(() => {
    toggleType('message'); // reset handled inside
    setDateFilter('all');
    setMediaTypeFilter('all');
  }, [toggleType, setDateFilter, setMediaTypeFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <div className="border-b border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Command className="h-3 w-3" />
              <span>Pressione</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">Ctrl</kbd>
              <span>+</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">K</kbd>
              <span>para abrir a busca</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">↑↓</kbd>
              <span>navegar</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">Enter</kbd>
              <span>selecionar</span>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar mensagens, imagens, vídeos, links... Use # para tags"
              className="h-12 pl-10 pr-20 text-lg"
              autoFocus
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    handleSearch('');
                    setResults([]);
                  }}
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant={showFilters ? 'secondary' : 'ghost'}
                size="icon"
                className="relative h-8 w-8"
                onClick={() => setShowFilters(!showFilters)}
                aria-label={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
              >
                <Filter className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {selectedTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedTags.map((tagId) => {
                const tag = allTags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <Badge
                    key={tagId}
                    variant="secondary"
                    className="gap-1 pr-1"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      borderColor: tag.color,
                    }}
                  >
                    <Tag className="h-3 w-3" />
                    {tag.name}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-0.5 h-4 w-4 hover:bg-transparent"
                      onClick={() => removeTag(tagId)}
                      aria-label={`Remover etiqueta ${tag.name}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                );
              })}
            </div>
          )}

          <GlobalSearchFilters
            show={showFilters}
            activeTypes={activeTypes}
            dateFilter={dateFilter}
            mediaTypeFilter={mediaTypeFilter}
            activeFiltersCount={activeFiltersCount}
            onToggleType={toggleType}
            onSetDateFilter={setDateFilter}
            onSetMediaTypeFilter={setMediaTypeFilter}
            onClearFilters={handleClearFilters}
          />
        </div>

        <ScrollArea className="max-h-96">
          {tagSuggestions.length > 0 && (
            <div className="border-b border-border p-2">
              <div className="flex items-center gap-1 px-2 pb-2 text-xs text-muted-foreground">
                <Tag className="h-3 w-3" /> Tags sugeridas
              </div>
              {tagSuggestions.map((tag, index) => (
                <button
                  key={tag.id}
                  onClick={() => handleTagSelect(tag)}
                  className={`flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors ${index === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'}`}
                >
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm">{tag.name}</span>
                </button>
              ))}
            </div>
          )}

          {showActions && tagSuggestions.length === 0 && (
            <div className="border-b border-border p-2">
              <div className="flex items-center gap-1 px-2 pb-2 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" /> Ações rápidas
              </div>
              {filteredActions.map((action, index) => (
                <button
                  key={action.id}
                  onClick={() => action.action()}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${!search && index === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'}`}
                >
                  <div className="rounded-full bg-accent/10 p-2 text-accent">{action.icon}</div>
                  <div className="flex-1">
                    <span className="text-sm font-medium">{action.title}</span>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          <GlobalSearchHistory
            show={showHistory}
            history={history}
            onSelect={handleHistorySelect}
            onRemove={removeFromHistory}
            onClear={clearHistory}
          />

          <GlobalSearchResults
            results={results}
            isLoading={isLoading}
            search={search}
            selectedIndex={selectedIndex}
            hasTagSuggestions={tagSuggestions.length > 0}
            onSelect={handleSelect}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
