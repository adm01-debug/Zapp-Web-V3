import { useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useEmailSearch, type EmailSearchResult } from '@/hooks/useEmailManagement';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EmailSearchBarProps {
  accountId: string | null;
  onSelectThread: (result: EmailSearchResult) => void;
  className?: string;
}

/** Email Search Bar component for the email section. */
export function EmailSearchBar({ accountId, onSelectThread, className }: EmailSearchBarProps) {
  const { query, results, isSearching, handleQueryChange, clearSearch } = useEmailSearch(accountId);
  const inputRef = useRef<HTMLInputElement>(null);
  const showDropdown = query.length >= 2;

  return (
    <div className={cn('relative', className)}>
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Buscar emails..."
          className="pl-9 pr-9 h-9 bg-muted/50 border-0 focus-visible:ring-1 text-sm"
        />
        {query && (
          <Button
            aria-label="Limpar busca"
            variant="ghost"
            size="icon"
            className="absolute right-1 h-7 w-7 hover:bg-transparent"
            onClick={() => { clearSearch(); inputRef.current?.focus(); }}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        {isSearching && (
          <Loader2 className="absolute right-8 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown de resultados */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover shadow-md max-h-80 overflow-auto">
          {results.length === 0 && !isSearching && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum email encontrado para "{query}"
            </div>
          )}

          {results.map(result => (
            <button type="button"
              key={`${result.thread_id}-${result.source}`}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60 text-left transition-colors border-b border-border/40 last:border-0"
              onClick={() => { onSelectThread(result); clearSearch(); }}
            >
              {/* Avatar inicial */}
              <div className="shrink-0 h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary uppercase">
                {(result.from_name || result.from_email || '?').charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-sm truncate', result.unread_count > 0 && 'font-semibold')}>
                    {result.subject || '(sem assunto)'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {result.source === 'remote' && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 h-4">Email</Badge>
                    )}
                    {result.unread_count > 0 && (
                      <Badge className="h-4 min-w-4 rounded-full text-[10px] px-1">{result.unread_count}</Badge>
                    )}
                    {result.last_message_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(result.last_message_at), { locale: ptBR, addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{result.snippet}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                  {result.from_name || result.from_email}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
