import { History, Clock, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SearchHistoryItem } from '@/hooks/useSearchHistory';

interface GlobalSearchHistoryProps {
  show: boolean;
  history: SearchHistoryItem[];
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}

export function GlobalSearchHistory({
  show,
  history,
  onSelect,
  onRemove,
  onClear,
}: GlobalSearchHistoryProps) {
  if (!show) return null;

  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <History className="h-3 w-3" /> Buscas recentes
        </span>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClear}>
          <Trash2 className="mr-1 h-3 w-3" /> Limpar
        </Button>
      </div>
      {history.map((item) => (
        <button
          key={item.timestamp}
          onClick={() => onSelect(item.query)}
          className="group flex w-full items-center justify-between rounded-lg p-2 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{item.query}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.resultCount !== undefined && (
              <span className="text-xs text-muted-foreground">{item.resultCount} resultados</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.query);
              }}
              aria-label="Remover do histórico"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </button>
      ))}
    </div>
  );
}
