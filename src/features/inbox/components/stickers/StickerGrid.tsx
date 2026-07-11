import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Trash2, Sticker, Plus, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CategorySelector } from './CategorySelector';
import { CATEGORY_LABELS, type StickerItem } from './StickerTypes';

interface StickerGridProps {
  stickers: StickerItem[];
  loading: boolean;
  search: string;
  gridSize: 'sm' | 'md' | 'lg';
  onSend: (sticker: StickerItem) => void;
  onToggleFavorite: (e: React.MouseEvent, sticker: StickerItem) => void;
  onDelete: (e: React.MouseEvent, sticker: StickerItem) => void;
  onCategoryChange: (sticker: StickerItem, cat: string) => void;
  onAddClick: () => void;
}

const gridColsMap = {
  sm: 'grid-cols-5',
  md: 'grid-cols-4',
  lg: 'grid-cols-3',
};

export function StickerGrid({
  stickers,
  loading,
  search,
  gridSize,
  onSend,
  onToggleFavorite,
  onDelete,
  onCategoryChange,
  onAddClick,
}: StickerGridProps) {
  const [deleteTarget, setDeleteTarget] = useState<StickerItem | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, sticker: StickerItem) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSend(sticker);
      } else if (e.key === 'f') {
        e.preventDefault();
        onToggleFavorite(e as unknown as React.MouseEvent, sticker);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setDeleteTarget(sticker);
      }
    },
    [onSend, onToggleFavorite]
  );

  const confirmDelete = (e: React.MouseEvent) => {
    if (deleteTarget) {
      onDelete(e, deleteTarget);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        role="status"
        aria-label="Carregando figurinhas"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Carregando figurinhas...</span>
      </div>
    );
  }

  if (stickers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center" role="status">
        <Sticker className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">
          {search ? 'Nenhuma figurinha encontrada' : 'Nenhuma figurinha'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Clique em <Plus className="inline h-3 w-3" aria-hidden="true" /> para adicionar
        </p>
        {!search && (
          <button
            onClick={onAddClick}
            className="mt-3 rounded px-2 py-1 text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Adicionar primeira figurinha
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[260px]">
        <div className="p-2" ref={gridRef} role="grid" aria-label="Grade de figurinhas">
          <div className={cn('grid gap-1.5', gridColsMap[gridSize])}>
            <AnimatePresence>
              {stickers.map((sticker, _idx) => (
                <Tooltip key={sticker.id}>
                  <TooltipTrigger asChild>
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => onSend(sticker)}
                      onKeyDown={(e) => handleKeyDown(e, sticker)}
                      onMouseEnter={() => setHoveredId(sticker.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      tabIndex={0}
                      role="gridcell"
                      aria-label={`${sticker.name || 'Figurinha'} - ${CATEGORY_LABELS[sticker.category]?.label || sticker.category}${sticker.is_favorite ? ' (favorita)' : ''} - usada ${sticker.use_count || 0}x`}
                      className={cn(
                        'group relative aspect-square overflow-hidden rounded-lg',
                        'bg-muted/30 transition-all duration-200 hover:bg-muted/60',
                        'border border-transparent hover:border-primary/30',
                        'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
                        sticker.is_favorite && 'ring-1 ring-primary/20'
                      )}
                    >
                      <img
                        src={sticker.image_url}
                        alt={sticker.name || 'Figurinha'}
                        className="h-full w-full object-contain p-1"
                        loading="lazy"
                        decoding="async"
                      />

                      {/* Category badge */}
                      <span
                        className="absolute left-0.5 top-0.5 text-[9px] leading-none"
                        aria-hidden="true"
                      >
                        {CATEGORY_LABELS[sticker.category]?.emoji || '📦'}
                      </span>

                      {/* Favorite indicator */}
                      {sticker.is_favorite && (
                        <span className="absolute right-0.5 top-0.5" aria-hidden="true">
                          <Star className="h-2.5 w-2.5 fill-primary text-primary" />
                        </span>
                      )}

                      {/* Usage badge */}
                      {sticker.use_count > 0 && (
                        <span
                          className="absolute bottom-0.5 right-0.5 rounded bg-background/80 px-1 text-[8px] leading-tight text-muted-foreground"
                          aria-hidden="true"
                        >
                          {sticker.use_count}×
                        </span>
                      )}

                      {/* Overlay actions */}
                      <div
                        className={cn(
                          'absolute inset-0 flex flex-col items-center justify-between bg-background/70 p-1 transition-opacity',
                          hoveredId === sticker.id ? 'opacity-100' : 'opacity-0'
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <button
                            onClick={(e) => onToggleFavorite(e, sticker)}
                            className="p-0.5 transition-transform hover:scale-110"
                            aria-label={
                              sticker.is_favorite
                                ? 'Remover dos favoritos'
                                : 'Adicionar aos favoritos'
                            }
                          >
                            <Star
                              className={cn(
                                'h-3.5 w-3.5 transition-colors',
                                sticker.is_favorite
                                  ? 'fill-primary text-primary'
                                  : 'text-muted-foreground hover:text-primary'
                              )}
                            />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(sticker);
                            }}
                            className="p-0.5 transition-transform hover:scale-110"
                            aria-label="Excluir figurinha"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <CategorySelector
                            value={sticker.category}
                            onChange={(cat) => onCategoryChange(sticker, cat)}
                            size="xs"
                          />
                        </div>
                      </div>
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[180px] text-xs">
                    <p className="font-medium">{sticker.name || 'Figurinha'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {CATEGORY_LABELS[sticker.category]?.emoji}{' '}
                      {CATEGORY_LABELS[sticker.category]?.label} · {sticker.use_count || 0}× usada
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Enter: enviar · F: favorito · Del: excluir
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir figurinha?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <span className="mt-2 flex items-center gap-3">
                  <img
                    src={deleteTarget.image_url}
                    alt=""
                    className="h-12 w-12 rounded bg-muted object-contain p-1"
                  />
                  <span>
                    "{deleteTarget.name || 'Figurinha'}" será removida permanentemente. Esta ação
                    não pode ser desfeita.
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
