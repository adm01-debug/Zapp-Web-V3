import { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Clock } from 'lucide-react';
import { CATEGORY_LABELS, type StickerItem } from './StickerTypes';

interface StickerCategoryBarProps {
  stickers: StickerItem[];
  activeCategory: string | null;
  showFavorites: boolean;
  showRecent: boolean;
  onCategoryChange: (cat: string | null) => void;
  onToggleFavorites: () => void;
  onToggleRecent: () => void;
  panelId?: string;
}

export function StickerCategoryBar({
  stickers,
  activeCategory,
  showFavorites,
  showRecent,
  onCategoryChange,
  onToggleFavorites,
  onToggleRecent,
  panelId,
}: StickerCategoryBarProps) {
  const categories = [...new Set(stickers.map(s => s.category).filter(Boolean))].sort();
  const favCount = stickers.filter(s => s.is_favorite).length;

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const totalTabs = 3 + categories.length;

  // Roving tabindex: Left/Right arrows cycle through tabs
  const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = e.key === 'ArrowRight'
      ? (idx + 1) % totalTabs
      : (idx - 1 + totalTabs) % totalTabs;
    tabRefs.current[next]?.focus();
  }, [totalTabs]);

  const isAll = !activeCategory && !showFavorites && !showRecent;

  const tabClass = (selected: boolean) => cn(
    'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary',
    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
  );

  return (
    <div className="px-2 py-2 border-b border-border/30" role="tablist" aria-label="Filtros de figurinhas">
      <ScrollArea className="w-full">
        <div className="flex gap-1.5 flex-wrap">
          <button
            ref={el => { tabRefs.current[0] = el; }}
            role="tab"
            aria-selected={isAll}
            aria-controls={panelId}
            tabIndex={isAll ? 0 : -1}
            onClick={() => onCategoryChange(null)}
            onKeyDown={e => handleKeyDown(e, 0)}
            className={tabClass(isAll)}
          >
            Todas ({stickers.length})
          </button>

          <button
            ref={el => { tabRefs.current[1] = el; }}
            role="tab"
            aria-selected={showRecent}
            aria-controls={panelId}
            tabIndex={showRecent ? 0 : -1}
            onClick={onToggleRecent}
            onKeyDown={e => handleKeyDown(e, 1)}
            className={cn(tabClass(showRecent), 'flex items-center gap-1')}
          >
            <Clock className="w-3 h-3" aria-hidden="true" /> Recentes
          </button>

          <button
            ref={el => { tabRefs.current[2] = el; }}
            role="tab"
            aria-selected={showFavorites}
            aria-controls={panelId}
            tabIndex={showFavorites ? 0 : -1}
            onClick={onToggleFavorites}
            onKeyDown={e => handleKeyDown(e, 2)}
            className={cn(tabClass(showFavorites), 'flex items-center gap-1')}
          >
            <Star className="w-3 h-3" aria-hidden="true" /> Favoritas {favCount > 0 && `(${favCount})`}
          </button>

          {categories.map((cat, i) => {
            const info = CATEGORY_LABELS[cat];
            const count = stickers.filter(s => s.category === cat).length;
            const selected = activeCategory === cat;
            return (
              <button
                key={cat}
                ref={el => { tabRefs.current[3 + i] = el; }}
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => onCategoryChange(selected ? null : cat)}
                onKeyDown={e => handleKeyDown(e, 3 + i)}
                className={tabClass(selected)}
              >
                <span aria-hidden="true">{info?.emoji || '📦'}</span> {info?.label || cat} ({count})
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
