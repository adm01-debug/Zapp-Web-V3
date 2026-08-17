import { queryKeys } from '@/services/api/queryKeys';
import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStickers, updateStickerFavorite, deleteStickerById, updateStickerCategory, incrementStickerUseCount } from '../../hooks/useStickerMutations';
import { getLogger } from '@/lib/logger';

const log = getLogger('StickerManager');
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sticker, Search, Grid3X3, LayoutGrid, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StickerGrid } from './StickerGrid';
import { StickerUploadPreview } from './StickerUploadPreview';
import { StickerCategoryBar } from './StickerCategoryBar';
import { PersonalStickers } from './PersonalStickers';
import {
  type StickerItem,
  type PendingUpload,
  sortStickersByRecent,
  RECENT_STICKERS_LIMIT,
} from './StickerTypes';
import {
  uploadStickerFile,
  insertStickerRow,
  removeStickerObject,
} from './stickerUpload';
import { AnimatePresence } from 'framer-motion';

interface StickerManagerProps {
  onSend?: (stickerUrl: string) => void;
  mode?: 'picker' | 'manager';
}

/**
 * Sticker Manager — figurinhas compartilhadas.
 *
 * Etapa 44 (findings-04 A7/A8):
 *  - A7: filtro "Recentes" agora filtra de verdade, por created_at do DB.
 *  - A8: upload de compartilhadas acessível AQUI (antes o pendingUpload nunca
 *    era setado — o preview e o upload eram inacessíveis). Fluxo:
 *    seleção → validação → upload ao bucket `stickers` → preview → insert no DB.
 *  - Etapa 44.5: erros honestos (mensagem real do storage/DB em toasts).
 */
export function StickerManager({ onSend, mode: _mode = 'manager' }: StickerManagerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [gridSize, setGridSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: stickers = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.stickers.all(),
    queryFn: async () => fetchStickers(),
  });

  const toggleFavorite = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await updateStickerFavorite(sticker.id, !sticker.is_favorite);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.stickers.all() }),
    onError: (err) => {
      // Etapa 44.5: erro honesto com a causa real.
      toast.error(
        `Erro ao atualizar favorito: ${err instanceof Error ? err.message : 'falha desconhecida'}`
      );
    },
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
    onError: (err) => {
      // Etapa 44.5: erro honesto — sem toast de sucesso em falha.
      toast.error(
        `Erro ao excluir figurinha: ${err instanceof Error ? err.message : 'falha desconhecida'}`
      );
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await updateStickerCategory(id, category);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.stickers.all() }),
    onError: (err) => {
      toast.error(
        `Erro ao alterar categoria: ${err instanceof Error ? err.message : 'falha desconhecida'}`
      );
    },
  });

  const handleSend = useCallback(
    (sticker: StickerItem) => {
      onSend?.(sticker.image_url);
      void incrementStickerUseCount(sticker.id, sticker.use_count)
        .then(({ error }) => {
          if (error) log.warn('[StickerManager] use_count update failed', error);
        })
        .catch((err: unknown) => {
          // Falha de rede rejeita a promise — sem handler vira unhandled
          // rejection a cada envio de figurinha.
          log.warn('[StickerManager] use_count update failed (rejeição)', err);
        });
    },
    [onSend]
  );

  // ── Etapa 44 (A8): upload de compartilhadas acessível no manager ──────────
  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadStickerFile(file);
      if (!result.ok) {
        // Etapa 44.5: erro honesto (validação ou storage com a causa real).
        toast.error(result.error);
        return;
      }
      setPendingUpload({
        file,
        imageUrl: result.url,
        storagePath: result.path,
        aiCategory: 'enviadas',
        selectedCategory: 'enviadas',
        name: file.name.replace(/\.[^.]+$/, ''),
      });
    } catch (err) {
      toast.error(
        `Erro ao processar figurinha: ${err instanceof Error ? err.message : 'falha inesperada'}`
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const handleConfirmUpload = useCallback(
    async (pending: PendingUpload) => {
      const { error: insertError } = await insertStickerRow({
        name: pending.name,
        imageUrl: pending.imageUrl,
        category: pending.selectedCategory,
      });
      if (insertError) {
        toast.error(`Erro ao salvar figurinha: ${insertError}`);
        return;
      }
      toast.success(`Figurinha "${pending.name}" salva!`);
      setPendingUpload(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.stickers.all() });
    },
    [queryClient]
  );

  const handleCancelUpload = useCallback(async () => {
    if (pendingUpload) {
      const { error } = await removeStickerObject(pendingUpload.storagePath);
      if (error) log.warn('[StickerManager] cleanup do objeto cancelado falhou:', error);
    }
    setPendingUpload(null);
  }, [pendingUpload]);

  const filteredStickers = useMemo(() => {
    let filtered = stickers;
    if (showFavorites) filtered = filtered.filter((s) => s.is_favorite);
    if (showRecent) {
      // A7 (Etapa 44): recência REAL — created_at do DB, decrescente e estável.
      return sortStickersByRecent(filtered).slice(0, RECENT_STICKERS_LIMIT);
    }
    if (category) filtered = filtered.filter((s) => s.category === category);
    if (search)
      filtered = filtered.filter((s) => s.name?.toLowerCase().includes(search.toLowerCase()));
    return filtered;
  }, [stickers, search, category, showFavorites, showRecent]);

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
              {/* Etapa 44 (A8): upload acessível no manager */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/webp,image/png,image/gif"
                className="hidden"
                aria-label="Adicionar figurinha compartilhada"
                onChange={handleFileSelect}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !!pendingUpload}
                aria-label="Adicionar nova figurinha compartilhada"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? 'Enviando...' : 'Adicionar'}
              </Button>
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
                onConfirm={(p) => void handleConfirmUpload(p)}
                onCancel={() => void handleCancelUpload()}
              />
            )}
          </AnimatePresence>

          {/* Etapa 44.5: erro HONESTO da query — visível com a causa real + retry */}
          {isError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              <span>
                Erro ao carregar figurinhas:{' '}
                {error instanceof Error ? error.message : 'falha desconhecida'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => void refetch()}
              >
                Tentar de novo
              </Button>
            </div>
          )}

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
            onAddClick={() => fileInputRef.current?.click()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
