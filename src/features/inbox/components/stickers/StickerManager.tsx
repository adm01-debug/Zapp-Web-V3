import { queryKeys } from '@/services/api/queryKeys';
import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStickers, updateStickerFavorite, deleteStickerById, updateStickerCategory, incrementStickerUseCount } from '../../hooks/useStickerMutations';
import { getLogger } from '@/lib/logger';

const log = getLogger('StickerManager');
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sticker, Search, Grid3X3, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StickerGrid } from './StickerGrid';
import { StickerUploadPreview } from './StickerUploadPreview';
import { StickerCategoryBar } from './StickerCategoryBar';
import { PersonalStickers } from './PersonalStickers';
import { type StickerItem, type PendingUpload } from './StickerTypes';
import { AnimatePresence } from 'framer-motion';

interface StickerManagerProps {
  onSend?: (stickerUrl: string) => void;
  mode?: 'picker' | 'manager';
}

/** Sticker Manager component for the stickers section. */
export function StickerManager({ onSend, mode: _mode = 'manager' }: StickerManagerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [gridSize, setGridSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const { data: stickers = [], isLoading } = useQuery({
    queryKey: queryKeys.stickers.all(),
    queryFn: async () => (await fetchStickers()) as StickerItem[],
  });

  const toggleFavorite = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await updateStickerFavorite(sticker.id, !sticker.is_favorite);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.stickers.all() }),
  });

  const deleteSticker = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await deleteStickerById(sticker.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stickers.all() });
      toast.success('Figurinha removida');
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await updateStickerCategory(id, category);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.stickers.all() }),
  });

  const handleSend = useCallback(
    (sticker: StickerItem) => {
      onSend?.(sticker.image_url);
      void incrementStickerUseCount(sticker.id, sticker.use_count).then(({ error }) => {
        if (error) log.warn('[StickerManager] use_count update failed', error);
      });
    },
    [onSend]
  );

  const filteredStickers = useMemo(() => {
    let filtered = stickers;
    if (showFavorites) filtered = filtered.filter((s) => s.is_favorite);
    if (category) filtered = filtered.filter((s) => s.category === category);
    if (search)
      filtered = filtered.filter((s) => s.name?.toLowerCase().includes(search.toLowerCase()));
    return filtered;
  }, [stickers, search, category, showFavorites]);

  const favoriteCount = useMemo(() => stickers.filter((s) => s.is_favorite).length, [stickers]);

  const stats = useMemo(
    () => ({
      total: stickers.length,
      favorites: favoriteCount,
      categories: new Set(stickers.map((s) => s.category)).size,
    }),
    [stickers, favoriteCount]
  );

  return (
    <div className="space-y-4">
      {/* Personal Stickers - always on top */}
      <PersonalStickers onSend={onSend} />

      {/* Shared Stickers */}
      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sticker className="h-5 w-5 text-primary" />
                Figurinhas Compartilhadas
              </CardTitle>
              <CardDescription>Figurinhas disponíveis para toda a equipe</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {stats.total} figurinhas
              </Badge>
              <Badge variant="outline" className="text-xs">
                ⭐ {stats.favorites}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + Grid Size Controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar figurinhas..."
                className="h-9 pl-9"
              />
            </div>
            <div className="flex items-center rounded-lg border border-border/50 p-0.5">
              <button type="button"
                onClick={() => setGridSize('sm')}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  gridSize === 'sm'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button type="button"
                onClick={() => setGridSize('md')}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  gridSize === 'md'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Category Bar */}
          <StickerCategoryBar
            stickers={stickers}
            activeCategory={category}
            showFavorites={showFavorites}
            showRecent={showRecent}
            onCategoryChange={setCategory}
            onToggleFavorites={() => setShowFavorites(!showFavorites)}
            onToggleRecent={() => setShowRecent(!showRecent)}
          />

          {/* Upload Preview */}
          <AnimatePresence>
            {pendingUpload && (
              <StickerUploadPreview
                pending={pendingUpload}
                onConfirm={(p) => {
                  toast.success(`Figurinha "${p.name}" salva!`);
                  setPendingUpload(null);
                  queryClient.invalidateQueries({ queryKey: queryKeys.stickers.all() });
                }}
                onCancel={() => setPendingUpload(null)}
              />
            )}
          </AnimatePresence>

          {/* Sticker Grid */}
          <StickerGrid
            stickers={filteredStickers}
            loading={isLoading}
            search={search}
            gridSize={gridSize}
            onSend={handleSend}
            onToggleFavorite={(e, s) => {
              e.stopPropagation();
              toggleFavorite.mutate(s);
            }}
            onDelete={(e, s) => {
              e.stopPropagation();
              deleteSticker.mutate(s);
            }}
            onCategoryChange={(s, cat) => updateCategory.mutate({ id: s.id, category: cat })}
            onAddClick={() => toast.info('Use o botão de upload na barra de ferramentas')}
          />
        </CardContent>
      </Card>
    </div>
  );
}