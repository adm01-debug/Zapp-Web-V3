import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Clock, Sparkles, X, Tag, Building } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactSearchWithSuggestionsProps {
  value: string;
  onChange: (val: string) => void;
  uniqueCompanies: string[];
  uniqueTags: string[];
  totalCount: number;
}

const STORAGE_KEY = 'contact-recent-searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentSearch(term: string) {
  if (!term.trim()) return;
  const recent = getRecentSearches().filter((s) => s !== term);
  recent.unshift(term);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function clearRecentSearches() {
  localStorage.removeItem(STORAGE_KEY);
}

export function ContactSearchWithSuggestions({
  value,
  onChange,
  uniqueCompanies,
  uniqueTags,
  totalCount,
}: ContactSearchWithSuggestionsProps) {
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused) setRecentSearches(getRecentSearches());
  }, [focused]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const suggestions = useMemo(() => {
    if (!value.trim()) return [];
    const lower = value.toLowerCase();
    const items: { type: 'company' | 'tag'; label: string; icon: typeof Building }[] = [];

    uniqueCompanies
      .filter((c) => c.toLowerCase().includes(lower))
      .slice(0, 3)
      .forEach((c) => items.push({ type: 'company', label: c, icon: Building }));

    uniqueTags
      .filter((t) => t.toLowerCase().includes(lower))
      .slice(0, 3)
      .forEach((t) => items.push({ type: 'tag', label: t, icon: Tag }));

    return items;
  }, [value, uniqueCompanies, uniqueTags]);

  const showDropdown = focused && (recentSearches.length > 0 || suggestions.length > 0 || !value);

  const handleSelect = (term: string) => {
    onChange(term);
    addRecentSearch(term);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      addRecentSearch(value.trim());
      setFocused(false);
    }
    if (e.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative min-w-[240px] max-w-md flex-1">
      <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder="Buscar por nome, telefone, email ou empresa..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        className={cn('pl-9 transition-all', focused && 'ring-2 ring-primary/20')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          >
            {/* Quick stats */}
            {!value && (
              <div className="border-b border-border/30 bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  <span>{totalCount} contatos na base</span>
                  <span>·</span>
                  <span>{uniqueCompanies.length} empresas</span>
                </div>
              </div>
            )}

            {/* Recent searches */}
            {!value && recentSearches.length > 0 && (
              <div className="p-2">
                <div className="mb-1 flex items-center justify-between px-2">
                  <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3 w-3" /> Recentes
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearRecentSearches();
                      setRecentSearches([]);
                    }}
                    className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Limpar
                  </button>
                </div>
                {recentSearches.map((term) => (
                  <button
                    type="button"
                    key={term}
                    onClick={() => handleSelect(term)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <Clock className="h-3 w-3 shrink-0 opacity-50" />
                    <span className="truncate">{term}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 ? (
              <div className="border-t border-border/30 p-2">
                <span className="px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Sugestões
                </span>
                {suggestions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={`${item.type}-${item.label}`}
                      onClick={() => handleSelect(item.label)}
                      className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
                    >
                      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">{item.label}</span>
                      <Badge
                        variant="secondary"
                        className="ml-auto h-4 shrink-0 border-none bg-primary/10 px-1 text-[9px] text-primary"
                      >
                        {item.type === 'company' ? 'Empresa' : 'Tag'}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            ) : (
              value.trim().length > 1 && (
                <div className="border-t border-border/30 p-4 text-center">
                  <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground">Nenhuma sugestão para "{value}"</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    Pressione Enter para buscar em todos os campos
                  </p>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
