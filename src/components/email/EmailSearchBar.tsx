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

export function EmailSearchBar({ accountId, onSelectThread, className }: EmailSearchBarProps) {
  const { query, results, isSearching, handleQueryChange, clearSearch } = useEmailSearch(accountId);
  const inputRef = useRef<HTMLInputElement>(null);
  const showDropdown = query.length >= 2;

  return (
    <div className={cn('relative', className)}>
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Buscar emails..."
          className="h-9 border-0 bg-muted/50 pl-9 pr-9 text-sm focus-visible:ring-1"
        />
        {query && (
          <Button
            aria-label="Limpar busca"
            variant="ghost"
            size="icon"
            className="absolute right-1 h-7 w-7 hover:bg-transparent"
            onClick={() => {
              clearSearch();
              inputRef.current?.focus();
            }}
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
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-lg border bg-popover shadow-md">
          {results.length === 0 && !isSearching && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum email encontrado para "{query}"
            </div>
          )}

          {results.map((result) => (
            <button
              type="button"
              key={`${result.thread_id}-${result.source}`}
              className="flex w-full items-start gap-3 border-b border-border/40 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/60"
              onClick={() => {
                onSelectThread(result);
                clearSearch();
              }}
            >
              {/* Avatar inicial */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
                {(result.from_name || result.from_email || '?').charAt(0)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn('truncate text-sm', result.unread_count > 0 && 'font-semibold')}
                  >
                    {result.subject || '(sem assunto)'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {result.source === 'remote' && (
                      <Badge variant="outline" className="h-4 px-1 py-0 text-[9px]">
                        Email
                      </Badge>
                    )}
                    {result.unread_count > 0 && (
                      <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px]">
                        {result.unread_count}
                      </Badge>
                    )}
                    {result.last_message_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(result.last_message_at), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{result.snippet}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
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
